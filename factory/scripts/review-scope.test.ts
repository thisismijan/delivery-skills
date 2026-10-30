import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DiffScan } from "./diff-scan";
import { CONTAINED_MAX_FILES, CONTAINED_MAX_LINES } from "./review-fanout";
import {
	type PreviousReview,
	type ScopeInput,
	decideReviewScope,
	reviewScope,
} from "./review-scope";

const PREV = "a".repeat(40);
const cleanScan = (paths: string[]): DiffScan => ({
	surfaces: [],
	marks: [],
	oneWay: [],
	loweredBar: [],
	paths,
	excluded: [],
});
const previous: PreviousReview = {
	head: PREV,
	verdict: "BLOCK",
	paths: ["src/a.ts", "src/b.ts"],
};
const delta = {
	changedFiles: 1,
	changedLines: 12,
	paths: ["src/a.ts"],
	excluded: [],
};
const base: ScopeInput = {
	breadth: "measured",
	previous,
	unrelatedPrevious: false,
	mergeCommits: 0,
	delta,
	deltaScan: cleanScan(["src/a.ts"]),
};

describe("deciding the review scope", () => {
	test("a small change inside files the last review covered reviews only that change", () => {
		expect(decideReviewScope(base)).toEqual({
			scope: "delta",
			since: PREV,
			reasons: [expect.stringContaining("Only 1 file(s)")],
		});
	});

	test("every other case reviews the whole change, naming why", () => {
		const cases: Array<
			[Partial<typeof base> & Record<string, unknown>, RegExp]
		> = [
			[{ breadth: "every-lens" }, /max level/],
			[{ previous: undefined }, /first review/],
			[
				{ previous: undefined, unrelatedPrevious: true },
				/not in this branch's history/,
			],
			[{ previous: { ...previous, verdict: undefined } }, /no verdict/],
			[{ mergeCommits: 1 }, /merged other commits/],
			[{ delta: undefined }, /could not be measured/],
			[
				{ deltaScan: { ...cleanScan(["src/a.ts"]), surfaces: ["auth"] } },
				/touches auth/,
			],
			[
				{
					deltaScan: { ...cleanScan(["src/a.ts"]), surfaces: ["dependencies"] },
				},
				/touches dependencies/,
			],
			[
				{
					deltaScan: {
						...cleanScan(["src/a.ts"]),
						oneWay: [{ path: "src/a.ts", line: "DROP" }],
					},
				},
				/one-way/,
			],
			[
				{
					deltaScan: {
						...cleanScan(["src/a.ts"]),
						loweredBar: [
							{ kind: "deleted-test", path: "src/a.test.ts", detail: "x" },
						],
					},
				},
				/weakens a test/,
			],
			[
				{ delta: { ...delta, changedFiles: CONTAINED_MAX_FILES + 1 } },
				/larger than/,
			],
			[
				{ delta: { ...delta, changedLines: CONTAINED_MAX_LINES } },
				/larger than/,
			],
			[
				{ delta: { ...delta, paths: ["src/a.ts", "src/c.ts"] } },
				/did not cover: src\/c\.ts/,
			],
		];
		for (const [override, reason] of cases) {
			const decision = decideReviewScope({
				...base,
				...override,
			} as typeof base);
			expect(decision.scope).toBe("full");
			expect(decision.reasons.join(" ")).toMatch(reason);
		}
	});

	test("user-facing files alone do not force a full review", () => {
		expect(
			decideReviewScope({
				...base,
				deltaScan: { ...cleanScan(["src/a.ts"]), surfaces: ["user-facing"] },
			}).scope,
		).toBe("delta");
	});
});

const dirs: string[] = [];
afterEach(() => {
	for (const dir of dirs.splice(0))
		rmSync(dir, { recursive: true, force: true });
});

function repo() {
	const root = mkdtempSync(join(tmpdir(), "review-scope-"));
	dirs.push(root);
	const run = (...args: string[]) => {
		const proc = Bun.spawnSync(["git", ...args], {
			cwd: root,
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
		return proc.stdout.toString().trim();
	};
	run("init", "--quiet", "-b", "main");
	run("config", "commit.gpgsign", "false");
	const commit = (path: string, text: string, message: string) => {
		mkdirSync(join(root, path, ".."), { recursive: true });
		writeFileSync(join(root, path), text);
		run("add", path);
		run("commit", "--quiet", "-m", message);
		return run("rev-parse", "HEAD");
	};
	const reviewed = (iid: string, head: string, verdict = "BLOCK") => {
		const dir = join(root, ".review", `mr-${iid}`, head);
		mkdirSync(dir, { recursive: true });
		writeFileSync(
			join(dir, "max.md"),
			`## Code review max\n\n**Head:** \`${head}\`\n**Verdict:** ${verdict}\n\n<!-- code-review-max:mr=${iid} head=${head} -->\n`,
		);
	};
	return { root, run, commit, reviewed };
}

describe("reading the last review from the repository", () => {
	test("a later fix to a reviewed file reviews only what changed since then", () => {
		const r = repo();
		const mainHead = r.commit("README.md", "hello\n", "init");
		r.run("checkout", "--quiet", "-b", "feature");
		r.commit("src/a.ts", "export const a = 1;\n", "feat");
		const first = r.commit("src/b.ts", "export const b = 1;\n", "feat b");
		r.reviewed("7", first);
		const head = r.commit("src/a.ts", "export const a = 2;\n", "fix");
		expect(
			reviewScope({
				repoRoot: r.root,
				iid: "7",
				base: mainHead,
				head,
				breadth: "measured",
			}),
		).toEqual({ scope: "delta", since: first, reasons: [expect.any(String)] });
	});

	test("a fix that touches a new file, a dependency, or merges main reviews everything", () => {
		const r = repo();
		const mainHead = r.commit("README.md", "hello\n", "init");
		r.run("checkout", "--quiet", "-b", "feature");
		const first = r.commit("src/a.ts", "export const a = 1;\n", "feat");
		r.reviewed("7", first);
		const newFile = r.commit("src/c.ts", "export const c = 1;\n", "new file");
		expect(
			reviewScope({
				repoRoot: r.root,
				iid: "7",
				base: mainHead,
				head: newFile,
				breadth: "measured",
			}),
		).toMatchObject({
			scope: "full",
			reasons: [expect.stringMatching(/did not cover: src\/c\.ts/)],
		});

		r.reviewed("7", newFile);
		const dependency = r.commit("package.json", '{"name":"x"}\n', "dep");
		expect(
			reviewScope({
				repoRoot: r.root,
				iid: "7",
				base: mainHead,
				head: dependency,
				breadth: "measured",
			}).reasons.join(" "),
		).toMatch(/dependencies/);

		r.reviewed("7", dependency);
		r.run("checkout", "--quiet", "main");
		r.commit("README.md", "hello again\n", "main moves");
		r.run("checkout", "--quiet", "feature");
		r.run("merge", "--quiet", "--no-edit", "main");
		const merged = r.run("rev-parse", "HEAD");
		expect(
			reviewScope({
				repoRoot: r.root,
				iid: "7",
				base: mainHead,
				head: merged,
				breadth: "measured",
			}).reasons.join(" "),
		).toMatch(/merged other commits/);
	});

	test("no valid earlier review, or one outside the history, means a full first review", () => {
		const r = repo();
		const mainHead = r.commit("README.md", "hello\n", "init");
		r.run("checkout", "--quiet", "-b", "feature");
		const head = r.commit("src/a.ts", "export const a = 1;\n", "feat");
		expect(
			reviewScope({
				repoRoot: r.root,
				iid: "7",
				base: mainHead,
				head,
				breadth: "measured",
			}).reasons,
		).toEqual(["This is the first review of this change."]);

		const stray = join(r.root, ".review", "mr-7", "b".repeat(40));
		mkdirSync(stray, { recursive: true });
		writeFileSync(join(stray, "max.md"), "no marker\n");
		expect(
			reviewScope({
				repoRoot: r.root,
				iid: "7",
				base: mainHead,
				head,
				breadth: "measured",
			}).reasons,
		).toEqual(["This is the first review of this change."]);

		r.run("checkout", "--quiet", "-b", "other", "main");
		const elsewhere = r.commit("src/x.ts", "x\n", "elsewhere");
		r.reviewed("7", elsewhere);
		expect(
			reviewScope({
				repoRoot: r.root,
				iid: "7",
				base: mainHead,
				head,
				breadth: "measured",
			}).reasons.join(" "),
		).toMatch(/not in this branch's history/);
	});

	test("malformed arguments fail closed", () => {
		const r = repo();
		const sha = r.commit("README.md", "x\n", "init");
		expect(() =>
			reviewScope({
				repoRoot: r.root,
				iid: "!7",
				base: sha,
				head: sha,
				breadth: "measured",
			}),
		).toThrow(/digits/);
		expect(() =>
			reviewScope({
				repoRoot: r.root,
				iid: "7",
				base: "main",
				head: sha,
				breadth: "measured",
			}),
		).toThrow(/full commit SHAs/);
	});
});
