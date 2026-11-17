import { afterEach, expect, test } from "bun:test";
import {
	mkdirSync,
	mkdtempSync,
	renameSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
	classify,
	measure,
	parseLcov,
	summarize,
} from "./characterize-measure";

const roots: string[] = [];
afterEach(() => {
	for (const root of roots.splice(0))
		rmSync(root, { recursive: true, force: true });
});

test("lcov paths are made relative to the repository root", () => {
	const lcov =
		"TN:\nSF:scripts/a.ts\nDA:1,3\nDA:2,0\nend_of_record\nSF:../adapters/b.ts\nDA:4,1\nend_of_record\n";
	const files = parseLcov(lcov, "factory/");
	expect([...files.keys()]).toEqual(["factory/scripts/a.ts", "adapters/b.ts"]);
	expect(files.get("factory/scripts/a.ts")?.get(2)).toBe(0);
});

test("each verdict follows from the change's surviving executable lines", () => {
	const coverage = new Map([
		[1, 2],
		[2, 0],
		[3, 0],
	]);
	expect(classify(true, [1, 2], coverage)).toEqual({
		verdict: "true-cover",
		changedLines: 2,
		executedLines: 1,
	});
	expect(classify(true, [2, 3], coverage)).toEqual({
		verdict: "false-cover",
		changedLines: 2,
		executedLines: 0,
	});
	expect(classify(true, [9], coverage).verdict).toBe("no-surviving-lines");
	expect(classify(true, [1, 2], undefined).verdict).toBe("false-cover");
	expect(classify(false, [1], coverage).verdict).toBe("needless-pass");
	expect(classify(false, [2], coverage).verdict).toBe("uncovered");
});

test("the summary counts misses, needless passes, and the covered line share", () => {
	const file = (
		verdict: Parameters<typeof summarize>[1][number]["verdict"],
		changed: number,
		ran: number,
	) => ({
		change: "c",
		path: `${verdict}.ts`,
		verdict,
		changedLines: changed,
		executedLines: ran,
	});
	expect(
		summarize(2, [
			file("true-cover", 4, 1),
			file("false-cover", 2, 0),
			file("needless-pass", 3, 3),
			file("uncovered", 1, 0),
		]),
	).toMatchObject({
		changes: 2,
		calledCovered: 2,
		falseCover: 1,
		falseCoverShare: 0.5,
		calledUncovered: 2,
		needlessPass: 1,
		coveredLineShare: 1 / 6,
		underHalfExecuted: 2,
		skipped: 0,
	});
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

test("an archived change's own lines are compared with coverage", async () => {
	const root = mkdtempSync(join(tmpdir(), "characterize-measure-"));
	roots.push(root);
	git(root, "init", "-q", "-b", "main");
	write(root, "src/fee.ts", "export const a = 1;\n");
	write(root, "tests/fee.test.ts", 'import { a } from "../src/fee";\n');
	git(root, "add", ".");
	git(root, "commit", "-q", "-m", "init");
	write(root, "src/fee.ts", "export const a = 1;\nexport const b = 2;\n");
	write(
		root,
		"openspec/changes/add-b/proposal.md",
		"## Why\n\nx\n\n## Impact\n\n`src/fee.ts`\n",
	);
	git(root, "add", ".");
	git(root, "commit", "-q", "-m", "feat: add b");
	mkdirSync(join(root, "openspec/changes/archive"), { recursive: true });
	renameSync(
		join(root, "openspec/changes/add-b"),
		join(root, "openspec/changes/archive/2026-11-17-add-b"),
	);
	git(root, "add", "-A");
	git(root, "commit", "-q", "-m", "chore: archive");
	const lcov = join(root, "lcov.info");
	writeFileSync(lcov, "SF:../src/fee.ts\nDA:1,1\nDA:2,0\nend_of_record\n");
	const result = await measure(root, lcov);
	expect(result.files).toEqual([
		{
			change: "add-b",
			path: "src/fee.ts",
			verdict: "false-cover",
			changedLines: 1,
			executedLines: 0,
		},
	]);
});
