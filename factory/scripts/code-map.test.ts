import { afterEach, describe, expect, test } from "bun:test";
import {
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	CODE_MAP_INVOCATION,
	CODE_MAP_MAX_CHARS,
	buildCodeMap,
	codeMapFor,
	exportedSymbols,
} from "./code-map";
import { buildReviewPacket } from "./review-packet";

const dirs: string[] = [];
afterEach(() => {
	for (const dir of dirs.splice(0))
		rmSync(dir, { recursive: true, force: true });
});

describe("exportedSymbols", () => {
	test("reads exported top-level names, not bodies or private names", () => {
		expect(
			exportedSymbols(
				"a.ts",
				"export function slug() {}\nexport const LIMIT = 4;\nexport interface Shape {}\nexport default thing;\nfunction hidden() {}\n  export const nested = 1;\n",
			),
		).toEqual(["slug", "LIMIT", "Shape", "default"]);
		expect(
			exportedSymbols(
				"a.py",
				"def run():\n    pass\nclass Job:\n    pass\ndef _private():\n    pass\n",
			),
		).toEqual(["run", "Job"]);
		expect(
			exportedSymbols(
				"a.go",
				"func Run() {}\nfunc (s *S) Start() {}\nfunc helper() {}\ntype Job struct{}\n",
			),
		).toEqual(["Run", "Start", "Job"]);
		expect(
			exportedSymbols(
				"A.java",
				"public final class Account {}\nclass Hidden {}\n",
			),
		).toEqual(["Account"]);
		expect(exportedSymbols("notes.md", "export function x() {}\n")).toEqual([]);
	});
});

describe("buildCodeMap", () => {
	test("stays within its cap and says how many files it left out", () => {
		const files = Array.from({ length: 400 }, (_, i) => ({
			path: `src/module-${i}.ts`,
			text: `export function handler${i}() {}\nexport const value${i} = ${i};\n`,
		}));
		const map = buildCodeMap(files);
		expect(map.length).toBeLessThanOrEqual(CODE_MAP_MAX_CHARS);
		expect(map).toMatch(/\[\d+ more files left out to stay within the cap\]$/);
		expect(map).toContain("- `src/module-0.ts`: handler0, value0");
	});

	test("an area with no exports says so", () => {
		expect(buildCodeMap([{ path: "a.ts", text: "const x = 1;\n" }])).toContain(
			"No exported symbols were found in the affected areas.",
		);
	});
});

function git(cwd: string, ...args: string[]): void {
	const proc = Bun.spawnSync(["git", ...args], {
		cwd,
		stdout: "pipe",
		stderr: "pipe",
		env: {
			...process.env,
			GIT_AUTHOR_NAME: "t",
			GIT_AUTHOR_EMAIL: "t@example.invalid",
			GIT_COMMITTER_NAME: "t",
			GIT_COMMITTER_EMAIL: "t@example.invalid",
		},
	});
	if (proc.exitCode !== 0) throw new Error(proc.stderr.toString());
}

test("the map covers the recorded areas and the Impact paths, without test files", async () => {
	const repo = mkdtempSync(join(tmpdir(), "code-map-"));
	dirs.push(repo);
	git(repo, "init", "--quiet", "-b", "main");
	mkdirSync(join(repo, "src", "area"), { recursive: true });
	writeFileSync(
		join(repo, "src", "area", "one.ts"),
		"export function one() {}\n",
	);
	writeFileSync(
		join(repo, "src", "area", "one.test.ts"),
		"export function testOnly() {}\n",
	);
	writeFileSync(join(repo, "src", "named.ts"), "export class Named {}\n");
	writeFileSync(join(repo, "src", "other.ts"), "export const unrelated = 1;\n");
	git(repo, "add", ".");
	git(repo, "commit", "--quiet", "-m", "base");
	const changeDir = join(repo, "openspec", "changes", "work");
	mkdirSync(changeDir, { recursive: true });
	writeFileSync(
		join(changeDir, "proposal.md"),
		"## Impact\n\n- `src/named.ts`\n",
	);
	writeFileSync(
		join(changeDir, ".delivery.json"),
		JSON.stringify({
			workItemKey: "W-1",
			complexitySignal: "medium",
			affectedAreas: ["src/area"],
		}),
	);
	const map = await codeMapFor(repo, changeDir);
	expect(map).toContain("- `src/area/one.ts`: one");
	expect(map).toContain("- `src/named.ts`: Named");
	expect(map).not.toContain("testOnly");
	expect(map).not.toContain("unrelated");
});

test("a context file goes into the packet whole, ahead of the diff", () => {
	const packet = buildReviewPacket({
		ticket: "T",
		spec: [{ title: "proposal.md", body: "P" }],
		diff: "D",
		evidence: [],
		context: [{ title: "code-map.md", body: "- `a.ts`: run" }],
	});
	expect(packet.indexOf("## Context")).toBeLessThan(packet.indexOf("## Diff"));
	expect(packet).toContain("### code-map.md");
	expect(packet).toContain("- `a.ts`: run");
});

test("execute builds the map and gives it to the test writer and implementer only", () => {
	const execute = readFileSync(
		join(import.meta.dir, "..", "..", "skills", "execute", "SKILL.md"),
		"utf8",
	).replace(/"\$\{FACTORY_ROOT\}\/([^"]+)"/g, "$1");
	expect(execute).toContain(
		`${CODE_MAP_INVOCATION.replace("<repoRoot>", '"<repoRoot>"')} > "<reviewDir>/code-map.md"`,
	);
	expect(execute).toContain(
		"--context <reviewDir>/code-map.md --out <reviewDir>/test-packet.md",
	);
	expect(execute).toContain(
		"--context <reviewDir>/code-map.md --out <reviewDir>/implement-packet.md",
	);
	expect(execute).not.toContain(
		"--context <reviewDir>/code-map.md --out <reviewDir>/review-packet.md",
	);
});
