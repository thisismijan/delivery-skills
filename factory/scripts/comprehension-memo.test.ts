import { afterEach, describe, expect, test } from "bun:test";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	COMPREHENSION_MEMO_FILENAME,
	COMPREHENSION_MEMO_INVOCATION,
	writeMemo,
} from "./comprehension-memo";
import { specSections } from "./review-packet";

const dirs: string[] = [];
afterEach(() => {
	for (const dir of dirs.splice(0))
		rmSync(dir, { recursive: true, force: true });
});

function repo(): { root: string; changeDir: string } {
	const root = mkdtempSync(join(tmpdir(), "memo-"));
	dirs.push(root);
	mkdirSync(join(root, "src"), { recursive: true });
	writeFileSync(join(root, "src", "entry.ts"), "export function run() {}\n");
	writeFileSync(join(root, "src", "entry.test.ts"), "test\n");
	const changeDir = join(root, "openspec", "changes", "work");
	mkdirSync(changeDir, { recursive: true });
	writeFileSync(join(changeDir, "proposal.md"), "## Why\n");
	return { root, changeDir };
}

const verdict = (complexitySignal: string, comprehension?: unknown) =>
	JSON.stringify({
		feasible: "yes",
		approachSketch: "x",
		affectedAreas: ["src"],
		contractsTouched: [],
		risks: [],
		complexitySignal,
		...(comprehension ? { comprehension } : {}),
	});

const memo = {
	entryPoints: [{ claim: "run starts the job", file: "src/entry.ts:1" }],
	callers: [{ claim: "an imagined caller", file: "src/missing.ts" }],
	tests: [{ claim: "entry.test.ts covers run", file: "src/entry.test.ts" }],
	openQuestions: ["Whether run is called twice"],
};

describe("writeMemo", () => {
	test("medium complexity saves a memo whose every claim cites a file", () => {
		const { root, changeDir } = repo();
		const result = writeMemo(root, changeDir, verdict("medium", memo));
		expect(result).toMatchObject({
			written: true,
			kept: 2,
			dropped: ["an imagined caller (src/missing.ts)"],
		});
		const text = readFileSync(
			join(changeDir, COMPREHENSION_MEMO_FILENAME),
			"utf8",
		);
		expect(text).toContain("- run starts the job (`src/entry.ts:1`)");
		expect(text).toContain("- entry.test.ts covers run (`src/entry.test.ts`)");
		expect(text).not.toContain("imagined caller");
		expect(text).toContain("- Whether run is called twice");
	});

	test("low complexity, a verdict with no memo, or a memo with no real file writes nothing", () => {
		const { root, changeDir } = repo();
		expect(writeMemo(root, changeDir, verdict("low", memo)).written).toBe(
			false,
		);
		expect(writeMemo(root, changeDir, verdict("high")).written).toBe(false);
		expect(
			writeMemo(
				root,
				changeDir,
				verdict("high", { ...memo, entryPoints: [], tests: [] }),
			).written,
		).toBe(false);
		expect(existsSync(join(changeDir, COMPREHENSION_MEMO_FILENAME))).toBe(
			false,
		);
	});

	test("a claim citing a path outside the repository is dropped", () => {
		const { root, changeDir } = repo();
		const result = writeMemo(
			root,
			changeDir,
			verdict("medium", {
				...memo,
				callers: [{ claim: "outside", file: "../etc/passwd" }],
			}),
		);
		expect(result.dropped).toContain("outside (../etc/passwd)");
	});
});

test("the memo is worker context, never part of the spec the holdout reviewer reads", () => {
	const { changeDir } = repo();
	writeFileSync(
		join(changeDir, COMPREHENSION_MEMO_FILENAME),
		"# Comprehension memo\n",
	);
	expect(specSections(changeDir).map((section) => section.title)).toEqual([
		"proposal.md",
	]);
});

test("feasibility writes the memo, draft saves it, execute passes it to both workers", () => {
	const root = join(import.meta.dir, "..", "..");
	const read = (path: string) =>
		readFileSync(join(root, path), "utf8").replace(
			/"\$\{FACTORY_ROOT\}\/([^"]+)"/g,
			"$1",
		);
	expect(read("skills/draft/SKILL.md")).toContain(
		COMPREHENSION_MEMO_INVOCATION.replace(
			"<repoRoot> <changeDir> <feasibility.json>",
			'"<repoRoot>" openspec/changes/<changeName> "<reviewDir>/feasibility.json"',
		),
	);
	expect(read("skills/execute/SKILL.md")).toContain(
		"add `--context <changeDir>/comprehension.md` to this packet and to the implementer's packet in step 7",
	);
	expect(
		read("factory/agents/feasibility-analyst.md").replace(/\s+/g, " "),
	).toContain(
		"Include `comprehension` when `complexitySignal` is `medium` or `high`, and leave it out for `low`.",
	);
});
