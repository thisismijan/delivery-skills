import { afterEach, expect, test } from "bun:test";
import {
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
	CHARACTERIZE_INVOCATION,
	characterization,
	checkCharacterization,
	isCharacterizable,
	references,
} from "./characterize";
import { parseZones } from "./zone-map";

const roots: string[] = [];
afterEach(() => {
	for (const root of roots.splice(0))
		rmSync(root, { recursive: true, force: true });
});

function git(cwd: string, ...args: string[]) {
	const run = Bun.spawnSync(
		[
			"git",
			"-c",
			"user.name=t",
			"-c",
			"user.email=t@example.test",
			"-c",
			"commit.gpgsign=false",
			...args,
		],
		{ cwd, stdout: "pipe", stderr: "pipe" },
	);
	if (run.exitCode !== 0) throw new Error(run.stderr.toString());
}

function write(root: string, path: string, text: string) {
	mkdirSync(dirname(join(root, path)), { recursive: true });
	writeFileSync(join(root, path), text);
}

function repo() {
	const root = mkdtempSync(join(tmpdir(), "characterize-"));
	roots.push(root);
	git(root, "init", "-q", "-b", "main");
	write(
		root,
		"src/billing/rules.ts",
		"export const fee = (n: number) => n * 2;\n",
	);
	write(root, "src/ui/button.ts", "export const label = () => 'Pay';\n");
	write(root, "src/ui/button.css", ".b {}\n");
	write(
		root,
		"tests/rules.test.ts",
		'import { fee } from "../src/billing/rules";\n',
	);
	git(root, "add", ".");
	git(root, "commit", "-q", "-m", "init");
	return root;
}

function change(root: string, impact: string[]) {
	write(
		root,
		"openspec/changes/pay/proposal.md",
		`## Why\n\nx\n\n## Impact\n\n${impact.map((path) => `\`${path}\``).join(", ")}\n`,
	);
	return join(root, "openspec/changes/pay");
}

test("a change to a file no test references needs a characterization pass", async () => {
	const root = repo();
	const result = await checkCharacterization(
		root,
		change(root, [
			"src/billing/rules.ts",
			"src/ui/button.ts",
			"src/ui/new-widget.ts",
		]),
	);
	expect(result).toMatchObject({
		characterize: true,
		uncovered: ["src/ui/button.ts"],
		covered: [{ path: "src/billing/rules.ts", tests: ["tests/rules.test.ts"] }],
	});
});

test("behaviour already referenced by a test needs no pass, and new files are never listed", async () => {
	const root = repo();
	const result = await checkCharacterization(
		root,
		change(root, [
			"src/billing/rules.ts",
			"src/ui/new-widget.ts",
			"src/ui/button.css",
		]),
	);
	expect(result).toMatchObject({ characterize: false, uncovered: [] });
});

test("a planned folder is expanded to its existing source files", async () => {
	const root = repo();
	write(
		root,
		"openspec/changes/pay/.delivery.json",
		JSON.stringify({
			workItemKey: "W-1",
			complexitySignal: "low",
			affectedAreas: ["src/ui"],
		}),
	);
	const result = await checkCharacterization(root, change(root, []));
	expect(result.uncovered).toEqual(["src/ui/button.ts"]);
});

test("references are found by import, module path, or the test's own name", () => {
	expect(
		references(
			"billing/rules.py",
			"tests/test_other.py",
			"from billing.rules import fee",
		),
	).toBe(true);
	expect(
		references(
			"src/main/java/x/Rules.java",
			"src/test/java/x/OtherTest.java",
			"import x.Rules;",
		),
	).toBe(true);
	expect(
		references(
			"src/main/java/x/Rules.java",
			"src/test/java/x/RulesTest.java",
			"",
		),
	).toBe(true);
	expect(references("pkg/rules.go", "pkg/rules_test.go", "package pkg")).toBe(
		true,
	);
	expect(references("lib/rules.rb", "spec/rules_spec.rb", "")).toBe(true);
	expect(
		references(
			"src/rules.ts",
			"src/other.test.ts",
			'import { x } from "./rulesets";',
		),
	).toBe(false);
	expect(references("src/a.ts", "src/a.test.ts", "")).toBe(false);
	expect(characterization(["src/a/b.ts"], [])).toEqual({
		uncovered: ["src/a/b.ts"],
		covered: [],
		pinned: [{ path: "src/a/b.ts", reason: "no test references it" }],
		characterize: true,
	});
	expect(isCharacterizable("tests/rules.test.ts")).toBe(false);
	expect(isCharacterizable("openspec/changes/x/tool.ts")).toBe(false);
	expect(isCharacterizable("README.md")).toBe(false);
});

test("the CLI exits 3 when a pass is needed", async () => {
	const root = repo();
	const dir = change(root, ["src/ui/button.ts"]);
	const run = Bun.spawnSync(
		[
			process.execPath,
			join(import.meta.dir, "characterize.ts"),
			"check",
			root,
			dir,
		],
		{
			stdout: "pipe",
			stderr: "pipe",
		},
	);
	expect(run.exitCode).toBe(3);
	expect(JSON.parse(run.stdout.toString()).uncovered).toEqual([
		"src/ui/button.ts",
	]);
});

test("execute runs the pass before the change's tests and the test writer has the mode", () => {
	const root = join(import.meta.dir, "..", "..");
	const execute = readFileSync(join(root, "skills/execute/SKILL.md"), "utf8")
		.replaceAll('"${FACTORY_ROOT}/scripts/', "scripts/")
		.replaceAll('.ts"', ".ts");
	expect(execute).toContain(CHARACTERIZE_INVOCATION);
	expect(execute.indexOf("3c. **Characterization pass.**")).toBeLessThan(
		execute.indexOf("4. **Write tests first.**"),
	);
	expect(execute.replace(/\s+/g, " ")).toContain(
		"keep them out of the red gate",
	);
	expect(execute.replace(/\s+/g, " ")).toContain(
		"Exit 3 lists `pinned` files, each with its reason (no test references it, or yellow zone)",
	);
	const writer = readFileSync(
		join(root, "factory/agents/test-writer.md"),
		"utf8",
	);
	expect(writer).toContain("## Characterization mode");
	expect(writer).toContain("These tests must pass on the current code.");
});

test("a referenced file in a yellow zone is pinned with that reason", async () => {
	const root = repo();
	write(root, ".delivery/zones", "yellow src/billing\n");
	const result = await checkCharacterization(
		root,
		change(root, ["src/billing/rules.ts"]),
	);
	expect(result).toMatchObject({
		characterize: true,
		uncovered: [],
		pinned: [{ path: "src/billing/rules.ts", reason: "yellow zone" }],
	});
	const run = Bun.spawnSync(
		[
			process.execPath,
			join(import.meta.dir, "characterize.ts"),
			"check",
			root,
			join(root, "openspec/changes/pay"),
		],
		{ stdout: "pipe", stderr: "pipe" },
	);
	expect(run.exitCode).toBe(3);
});

test("without a map, or outside yellow, a referenced file is not pinned; red is not yellow", () => {
	const tests = [
		{
			path: "tests/rules.test.ts",
			text: 'import { fee } from "../src/billing/rules";',
		},
	];
	const sources = ["src/billing/rules.ts"];
	expect(characterization(sources, tests)).toMatchObject({
		pinned: [],
		characterize: false,
	});
	expect(
		characterization(sources, tests, parseZones("yellow src/ui\n")),
	).toMatchObject({ pinned: [], characterize: false });
	expect(
		characterization(
			sources,
			tests,
			parseZones("red src/billing\nyellow src\n"),
		),
	).toMatchObject({ pinned: [], characterize: false });
	expect(
		characterization(
			["src/ui/x.ts", ...sources],
			tests,
			parseZones("yellow src\n"),
		).pinned,
	).toEqual([
		{ path: "src/ui/x.ts", reason: "no test references it" },
		{ path: "src/billing/rules.ts", reason: "yellow zone" },
	]);
});
