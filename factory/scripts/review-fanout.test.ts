import { afterEach, describe, expect, test } from "bun:test";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	readdirSync,
	renameSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
	CONTAINED_MAX_FILES,
	CONTAINED_MAX_LINES,
	REVIEW_LENSES,
	type ReviewFanoutInput,
	measureReviewableDiff,
	planAdjudication,
	planCoverage,
	planReadinessFanout,
	planReviewFanout,
} from "./review-fanout";

const smallInput: ReviewFanoutInput = {
	changedFiles: 2,
	changedLines: 49,
	reversible: true,
	classificationComplete: true,
	surfaces: ["user-facing"],
};

test("a pinned diff with no reviewable code skips every lens", () => {
	expect(
		planReviewFanout({
			changedFiles: 0,
			changedLines: 0,
			reversible: true,
			classificationComplete: true,
			surfaces: [],
		}),
	).toEqual({
		mode: "empty",
		lenses: [],
		reason: "no reviewable code in the pinned diff",
	});
});

test("small reversible changes use the two essential lenses", () => {
	expect(planReviewFanout(smallInput)).toEqual({
		mode: "small",
		lenses: ["correctness-security", "tests-specification"],
		reason: "small reversible change with no sensitive surface",
	});
});

test("a reversible non-sensitive change within the contained bounds runs the two essential lenses", () => {
	for (const input of [
		{ ...smallInput, changedFiles: 3 },
		{ ...smallInput, changedLines: 50 },
		{
			...smallInput,
			changedFiles: CONTAINED_MAX_FILES,
			changedLines: CONTAINED_MAX_LINES - 1,
		},
	]) {
		const plan = planReviewFanout(input);
		expect(plan.mode).toBe("contained");
		expect(plan.lenses).toEqual([
			"correctness-security",
			"tests-specification",
		]);
	}
});

test("readiness skips every lens subagent on an empty or small diff", () => {
	expect(
		planReadinessFanout({
			changedFiles: 0,
			changedLines: 0,
			reversible: true,
			classificationComplete: true,
			surfaces: [],
		}),
	).toEqual({
		mode: "empty",
		lenses: [],
		reason: "no reviewable code in the pinned diff",
	});
	expect(planReadinessFanout(smallInput)).toEqual({
		mode: "small",
		lenses: [],
		reason: "small reversible change with no sensitive surface",
	});
	expect(
		planReadinessFanout({ ...smallInput, surfaces: ["dependencies"] }).mode,
	).toBe("small");
});

test("readiness keeps every lens on an unproven or sensitive change", () => {
	expect(
		planReadinessFanout({
			...smallInput,
			classificationComplete: false,
		}).mode,
	).toBe("full");
	expect(planReadinessFanout({ ...smallInput, reversible: false }).mode).toBe(
		"full",
	);
	expect(planReadinessFanout({ ...smallInput, changedFiles: 3 }).mode).toBe(
		"full",
	);
	expect(
		planReadinessFanout({ ...smallInput, surfaces: ["auth"] }).lenses,
	).toEqual(["rollback", "compatibility", "security", "operability"]);
});

test("the readiness CLI emits the deterministic plan", async () => {
	const inputPath = join(import.meta.dir, ".readiness-fanout-input.test.json");
	try {
		await Bun.write(inputPath, JSON.stringify(smallInput));
		const proc = Bun.spawn(
			[
				"bun",
				join(import.meta.dir, "review-fanout.ts"),
				"readiness",
				inputPath,
			],
			{ stdout: "pipe", stderr: "pipe" },
		);
		expect(await proc.exited).toBe(0);
		expect(JSON.parse(await new Response(proc.stdout).text())).toMatchObject({
			mode: "small",
			lenses: [],
		});
	} finally {
		await Bun.file(inputPath).delete();
	}
});

test("an unproven empty diff still uses the full review", () => {
	const plan = planReviewFanout({
		changedFiles: 0,
		changedLines: 0,
		reversible: true,
		classificationComplete: false,
		surfaces: [],
	});
	expect(plan.mode).toBe("full");
	expect(plan.lenses).toEqual([...REVIEW_LENSES]);
});

test("every threshold boundary fails to the full review", () => {
	const boundaries: ReviewFanoutInput[] = [
		{ ...smallInput, changedFiles: CONTAINED_MAX_FILES + 1 },
		{ ...smallInput, changedLines: CONTAINED_MAX_LINES },
		{ ...smallInput, reversible: false },
		{ ...smallInput, classificationComplete: false },
		{ ...smallInput, changedFiles: 3, surfaces: ["dependencies"] },
	];
	for (const input of boundaries) {
		const plan = planReviewFanout(input);
		expect(plan.mode).toBe("full");
		expect(plan.lenses).toEqual([...REVIEW_LENSES]);
	}
});

test("every sensitive surface forces all four lenses", () => {
	for (const surface of [
		"data",
		"contract",
		"config",
		"auth",
		"infra",
	] as const) {
		const plan = planReviewFanout({ ...smallInput, surfaces: [surface] });
		expect(plan.mode).toBe("full");
		expect(plan.lenses).toEqual([...REVIEW_LENSES]);
		expect(plan.reason).toContain(surface);
	}
});

test("invalid and unknown classifications fail closed", () => {
	expect(() => planReviewFanout({ ...smallInput, changedFiles: -1 })).toThrow();
	expect(() =>
		planReviewFanout({
			...smallInput,
			surfaces: ["unknown"],
		} as never),
	).toThrow();
});

test("the CLI emits the deterministic plan", async () => {
	const inputPath = join(import.meta.dir, ".review-fanout-input.test.json");
	try {
		await Bun.write(inputPath, JSON.stringify(smallInput));
		const proc = Bun.spawn(
			["bun", join(import.meta.dir, "review-fanout.ts"), inputPath],
			{
				stdout: "pipe",
				stderr: "pipe",
			},
		);
		expect(await proc.exited).toBe(0);
		expect(JSON.parse(await new Response(proc.stdout).text())).toMatchObject({
			mode: "small",
			lenses: ["correctness-security", "tests-specification"],
		});
	} finally {
		await Bun.file(inputPath).delete();
	}
});

test("spec and delivery artefacts do not count toward the measured diff", () => {
	const numstat = [
		"4\t2\tsrc/slug.ts",
		"30\t0\ttest/slug.test.ts",
		"60\t0\topenspec/changes/change-tb-1/proposal.md",
		"2\t0\topenspec/changes/change-tb-1/.openspec.yaml",
		"1\t0\t.delivery/routing/model-inventory.json",
		"-\t-\tassets/logo.png",
	].join("\n");
	expect(measureReviewableDiff(numstat)).toEqual({
		changedFiles: 3,
		changedLines: 37,
		paths: ["src/slug.ts", "test/slug.test.ts", "assets/logo.png"],
		excluded: [
			"openspec/changes/change-tb-1/proposal.md",
			"openspec/changes/change-tb-1/.openspec.yaml",
			".delivery/routing/model-inventory.json",
		],
	});
});

test("a path that only resembles a spec directory is still counted", () => {
	expect(
		measureReviewableDiff("3\t1\tsrc/openspec/parser.ts\n").changedFiles,
	).toBe(1);
});

test("an unreadable numstat line fails closed", () => {
	expect(() => measureReviewableDiff("garbage")).toThrow();
});

test("adjudication escalates only when a candidate can block", () => {
	expect(planAdjudication({ candidates: [] }).mode).toBe("none");
	expect(
		planAdjudication({
			candidates: [{ severity: "Low" }, { severity: "Low" }],
		}).mode,
	).toBe("standard");
	for (const severity of ["Medium", "High", "Critical"] as const) {
		expect(
			planAdjudication({
				candidates: [{ severity: "Low" }, { severity }],
			}).mode,
		).toBe("main");
	}
});

test("an unknown candidate severity fails closed", () => {
	expect(() =>
		planAdjudication({ candidates: [{ severity: "Nit" }] } as never),
	).toThrow();
});

const FANOUT = join(import.meta.dir, "review-fanout.ts");
const CS = "correctness-security" as const;
const TS = "tests-specification" as const;
const FROM = "1".repeat(40);
const HEAD = "2".repeat(40);

const scratchDirs: string[] = [];
afterEach(() => {
	for (const dir of scratchDirs.splice(0))
		rmSync(dir, { recursive: true, force: true });
});

function scratch(prefix = "review-coverage-"): string {
	const dir = mkdtempSync(join(tmpdir(), prefix));
	scratchDirs.push(dir);
	return dir;
}

const GIT_ENV = {
	...process.env,
	GIT_AUTHOR_NAME: "t",
	GIT_AUTHOR_EMAIL: "t@example.invalid",
	GIT_COMMITTER_NAME: "t",
	GIT_COMMITTER_EMAIL: "t@example.invalid",
};

function gitRepo() {
	const root = scratch("review-coverage-repo-");
	const git = (...args: string[]) => {
		const proc = Bun.spawnSync(["git", ...args], {
			cwd: root,
			stdout: "pipe",
			stderr: "pipe",
			env: GIT_ENV,
		});
		if (proc.exitCode !== 0) throw new Error(proc.stderr.toString());
		return proc.stdout.toString().trim();
	};
	git("init", "--quiet", "-b", "main");
	git("config", "commit.gpgsign", "false");
	const commit = (
		files: Record<string, string | Uint8Array | null>,
		message = "change",
	) => {
		for (const [path, content] of Object.entries(files)) {
			if (content === null) {
				rmSync(join(root, path));
				continue;
			}
			mkdirSync(dirname(join(root, path)), { recursive: true });
			writeFileSync(join(root, path), content);
		}
		git("add", "-A");
		git("commit", "--quiet", "-m", message);
		return git("rev-parse", "HEAD");
	};
	const move = (from: string, to: string) => {
		mkdirSync(dirname(join(root, to)), { recursive: true });
		renameSync(join(root, from), join(root, to));
	};
	return { root, commit, move };
}

function fanout(cwd: string, ...args: string[]) {
	const proc = Bun.spawnSync(["bun", FANOUT, ...args], {
		cwd,
		stdout: "pipe",
		stderr: "pipe",
	});
	return {
		code: proc.exitCode,
		out: proc.stdout.toString(),
		err: proc.stderr.toString(),
	};
}

function pathsRun(cwd: string, from: string, head: string, ...extra: string[]) {
	const run = fanout(cwd, "paths", from, head, ...extra);
	return {
		...run,
		result: run.code === 0 ? JSON.parse(run.out) : undefined,
	};
}

function coverageRun(
	cwd: string,
	work: string,
	from: string,
	head: string,
	input: unknown,
	extra: string[] = [],
) {
	const inputPath = join(work, "lens-coverage-input.json");
	const outPath = join(work, "lens-coverage.json");
	writeFileSync(inputPath, JSON.stringify(input));
	const run = fanout(cwd, "coverage", from, head, inputPath, outPath, ...extra);
	return {
		...run,
		outPath,
		result: run.code === 0 ? JSON.parse(run.out) : undefined,
		artifact: existsSync(outPath)
			? JSON.parse(readFileSync(outPath, "utf8"))
			: undefined,
	};
}

const report = (
	lens: typeof CS | typeof TS | string,
	...examined: string[]
) => ({
	lens,
	examined,
});
const fullInput = (reports: unknown[], focused?: unknown[]) => ({
	scope: "full" as const,
	plannedLenses: [CS, TS],
	reports,
	...(focused ? { focused } : {}),
});
const deltaInput = (reports: unknown[], focused?: unknown[]) => ({
	...fullInput(reports, focused),
	scope: "delta" as const,
});
const returned = (path: string, ...examined: string[]) => ({
	path,
	status: "returned" as const,
	examined,
});
const failed = (path: string) => ({ path, status: "failed" as const });

const changed = (paths: string[], binary: string[] = []) => ({
	from: FROM,
	head: HEAD,
	paths,
	binary,
});
const plan = (input: ReturnType<typeof fullInput>, paths: string[]) =>
	planCoverage(input, changed(paths), undefined, undefined);
const unexaminedPaths = (result: { unexamined: { path: string }[] }) =>
	result.unexamined.map((entry) => entry.path);
const passesByPath = (result: {
	unexamined: { path: string; focusedPass: string }[];
}) =>
	Object.fromEntries(
		result.unexamined.map((entry) => [entry.path, entry.focusedPass]),
	);

const ABC = ["src/a.ts", "src/b.ts", "src/c.ts"];
const ABCD = [...ABC, "src/d.ts"];

describe("planCoverage", () => {
	test("files no lens listed are unexamined, in listing order, whichever lens listed the others", () => {
		const result = plan(
			fullInput([report(CS, "src/d.ts"), report(TS, "src/b.ts")]),
			ABCD,
		);
		expect(result).toMatchObject({
			status: "checked",
			scope: "full",
			from: FROM,
			head: HEAD,
			earlier: "none",
			checkedFiles: 4,
			binary: [],
			needsFocusedPass: ["src/a.ts", "src/c.ts"],
			stillUnexamined: ["src/a.ts", "src/c.ts"],
		});
		expect(result.unexamined).toEqual([
			{ path: "src/a.ts", carried: false, focusedPass: "pending" },
			{ path: "src/c.ts", carried: false, focusedPass: "pending" },
		]);
	});

	test("a file only one lens listed counts as examined", () => {
		const result = plan(
			fullInput([report(CS, "src/a.ts", "src/b.ts"), report(TS, "src/c.ts")]),
			ABC,
		);
		expect(unexaminedPaths(result)).toEqual([]);
	});

	test("every file examined leaves nothing pending", () => {
		const result = plan(fullInput([report(CS, ...ABC), report(TS)]), ABC);
		expect(result.unexamined).toEqual([]);
		expect(result.needsFocusedPass).toEqual([]);
		expect(result.stillUnexamined).toEqual([]);
		expect(result.checkedFiles).toBe(3);
	});

	test("a path outside the changed files adds nothing and is not an error", () => {
		const result = plan(
			fullInput([
				report(CS, "src/unchanged.ts", "src/a.ts"),
				report(TS, "openspec/changes/x/proposal.md"),
			]),
			["src/a.ts", "src/b.ts"],
		);
		expect(unexaminedPaths(result)).toEqual(["src/b.ts"]);
		expect(result.checkedFiles).toBe(2);
	});

	test("a changed file that no report mentions is still unexamined", () => {
		const result = plan(fullInput([report(CS, "src/a.ts"), report(TS)]), ABC);
		expect(unexaminedPaths(result)).toEqual(["src/b.ts", "src/c.ts"]);
	});

	test("paths are compared exactly: doubled slashes, case and surrounding whitespace do not match", () => {
		for (const written of [
			"src//a.ts",
			" src/a.ts ",
			"src/a.ts ",
			"SRC/a.ts",
		]) {
			const result = plan(fullInput([report(CS, written), report(TS)]), [
				"src/a.ts",
			]);
			expect(unexaminedPaths(result)).toEqual(["src/a.ts"]);
		}
	});

	test("a path repeated inside one report is accepted and counted once", () => {
		const result = plan(
			fullInput([report(CS, "src/a.ts", "src/a.ts"), report(TS)]),
			["src/a.ts", "src/b.ts"],
		);
		expect(unexaminedPaths(result)).toEqual(["src/b.ts"]);
	});

	test("a binary file is named, not counted, and a lens listing it adds nothing", () => {
		const result = planCoverage(
			fullInput([report(CS, "assets/logo.png", "src/a.ts"), report(TS)]),
			changed(["src/a.ts", "src/b.ts"], ["assets/logo.png"]),
			undefined,
			undefined,
		);
		expect(result.binary).toEqual(["assets/logo.png"]);
		expect(result.checkedFiles).toBe(2);
		expect(unexaminedPaths(result)).toEqual(["src/b.ts"]);
		expect(result.needsFocusedPass).toEqual(["src/b.ts"]);
	});

	test("an empty plan with no reports is a skip that names why and checks nothing", () => {
		const result = planCoverage(
			{ scope: "full", plannedLenses: [], reports: [] },
			changed(ABC),
			undefined,
			undefined,
		);
		expect(result).toMatchObject({
			status: "skipped",
			scope: "full",
			reason: "no lens ran, so there is nothing to check",
			checkedFiles: 0,
			unexamined: [],
			needsFocusedPass: [],
			stillUnexamined: [],
			binary: [],
		});
	});

	test("a missing, extra, or repeated lens report throws instead of guessing", () => {
		expect(() => plan(fullInput([report(CS, "src/a.ts")]), ABC)).toThrow();
		expect(() =>
			plan(
				fullInput([
					report(CS),
					report(TS),
					report("reliability-operations", "src/a.ts"),
				]),
				ABC,
			),
		).toThrow();
		expect(() =>
			plan(fullInput([report(CS), report(CS), report(TS)]), ABC),
		).toThrow();
		expect(() =>
			planCoverage(
				{ scope: "full", plannedLenses: [], reports: [report(CS)] },
				changed(ABC),
				undefined,
				undefined,
			),
		).toThrow();
	});

	test("a returned pass whose list holds its own path is examined and leaves the still-unexamined list", () => {
		const first = plan(fullInput([report(CS, "src/a.ts"), report(TS)]), ABCD);
		const result = planCoverage(
			fullInput(
				[report(CS, "src/a.ts"), report(TS)],
				[returned("src/b.ts", "src/b.ts", "src/other.ts")],
			),
			changed(ABCD),
			undefined,
			first,
		);
		expect(passesByPath(result)).toEqual({
			"src/b.ts": "examined",
			"src/c.ts": "pending",
			"src/d.ts": "pending",
		});
		expect(result.needsFocusedPass).toEqual(["src/c.ts", "src/d.ts"]);
		expect(result.stillUnexamined).toEqual(["src/c.ts", "src/d.ts"]);
	});

	test("a returned pass whose list omits its own path is recorded as failed and stays unexamined", () => {
		const first = plan(fullInput([report(CS, "src/a.ts"), report(TS)]), ABCD);
		const result = planCoverage(
			fullInput(
				[report(CS, "src/a.ts"), report(TS)],
				[returned("src/b.ts", "src/a.ts"), returned("src/c.ts")],
			),
			changed(ABCD),
			undefined,
			first,
		);
		expect(passesByPath(result)).toMatchObject({
			"src/b.ts": "failed",
			"src/c.ts": "failed",
		});
		expect(result.stillUnexamined).toEqual([
			"src/b.ts",
			"src/c.ts",
			"src/d.ts",
		]);
		expect(result.needsFocusedPass).toEqual(["src/d.ts"]);
	});

	test("a pass cannot cover another file by listing it", () => {
		const first = plan(fullInput([report(CS, "src/a.ts"), report(TS)]), ABCD);
		const result = planCoverage(
			fullInput(
				[report(CS, "src/a.ts"), report(TS)],
				[returned("src/b.ts", "src/c.ts")],
			),
			changed(ABCD),
			undefined,
			first,
		);
		expect(passesByPath(result)).toMatchObject({
			"src/b.ts": "failed",
			"src/c.ts": "pending",
		});
		expect(result.needsFocusedPass).toContain("src/c.ts");
	});

	test("a failed pass stays in the still-unexamined list and is not asked for again", () => {
		const first = plan(fullInput([report(CS, "src/a.ts"), report(TS)]), ABC);
		const result = planCoverage(
			fullInput([report(CS, "src/a.ts"), report(TS)], [failed("src/b.ts")]),
			changed(ABC),
			undefined,
			first,
		);
		expect(passesByPath(result)["src/b.ts"]).toBe("failed");
		expect(result.stillUnexamined).toEqual(["src/b.ts", "src/c.ts"]);
		expect(result.needsFocusedPass).toEqual(["src/c.ts"]);
	});

	test("a recorded pass is kept even when a later lens lists that file, so a second resume does not pass it again", () => {
		const firstReports = [report(CS, "src/a.ts"), report(TS)];
		const first = plan(fullInput(firstReports), ABC);
		const recorded = planCoverage(
			fullInput(firstReports, [
				failed("src/b.ts"),
				returned("src/c.ts", "src/c.ts"),
			]),
			changed(ABC),
			undefined,
			first,
		);
		const lensNowListsB = [report(CS, "src/a.ts", "src/b.ts"), report(TS)];
		const covered = planCoverage(
			fullInput(lensNowListsB),
			changed(ABC),
			undefined,
			recorded,
		);
		expect(covered.unexamined.map((entry) => entry.path)).toEqual(["src/c.ts"]);
		expect(covered.needsFocusedPass).toEqual([]);
		const uncoveredAgain = planCoverage(
			fullInput(firstReports),
			changed(ABC),
			undefined,
			covered,
		);
		expect(passesByPath(uncoveredAgain)["src/b.ts"]).toBe("failed");
		expect(passesByPath(uncoveredAgain)["src/c.ts"]).toBe("examined");
		expect(uncoveredAgain.needsFocusedPass).toEqual([]);
	});

	test("a fresh input with no outcomes keeps the outcomes the earlier artifact recorded", () => {
		const reports = [report(CS, "src/a.ts"), report(TS)];
		const first = plan(fullInput(reports), ABCD);
		const second = planCoverage(
			fullInput(reports, [
				returned("src/b.ts", "src/b.ts"),
				failed("src/c.ts"),
			]),
			changed(ABCD),
			undefined,
			first,
		);
		const resumed = planCoverage(
			fullInput(reports),
			changed(ABCD),
			undefined,
			second,
		);
		expect(passesByPath(resumed)).toEqual({
			"src/b.ts": "examined",
			"src/c.ts": "failed",
			"src/d.ts": "pending",
		});
		expect(resumed.needsFocusedPass).toEqual(["src/d.ts"]);
		expect(resumed.stillUnexamined).toEqual(["src/c.ts", "src/d.ts"]);
	});

	test("a second outcome for a file the artifact already recorded throws", () => {
		const reports = [report(CS, "src/a.ts"), report(TS)];
		const first = plan(fullInput(reports), ABC);
		const second = planCoverage(
			fullInput(reports, [failed("src/b.ts")]),
			changed(ABC),
			undefined,
			first,
		);
		for (const outcome of [
			failed("src/b.ts"),
			returned("src/b.ts", "src/b.ts"),
		]) {
			expect(() =>
				planCoverage(
					fullInput(reports, [outcome]),
					changed(ABC),
					undefined,
					second,
				),
			).toThrow();
		}
	});

	test("an artifact recorded for another head is refused", () => {
		const reports = [report(CS, "src/a.ts"), report(TS)];
		const first = plan(fullInput(reports), ABC);
		expect(() =>
			planCoverage(fullInput(reports), changed(ABC), undefined, {
				...first,
				head: "3".repeat(40),
			}),
		).toThrow();
	});

	test("a focused candidate appended to the lens candidates moves adjudication from none to main", () => {
		const result = plan(fullInput([report(CS, "src/a.ts"), report(TS)]), ABC);
		expect(result.needsFocusedPass).toEqual(["src/b.ts", "src/c.ts"]);
		const lensCandidates = { candidates: [] as { severity: "Medium" }[] };
		expect(planAdjudication(lensCandidates).mode).toBe("none");
		const merged = {
			candidates: [
				...lensCandidates.candidates,
				{ severity: "Medium" as const },
			],
		};
		expect(planAdjudication(merged).mode).toBe("main");
	});
});

describe("review-fanout paths", () => {
	function threeFileChange() {
		const r = gitRepo();
		const base = r.commit({ "README.md": "hello\n" });
		const head = r.commit({
			"src/a.ts": "export const a = 1;\n",
			"src/b.ts": "export const b = 1;\n",
			"src/c.ts": "export const c = 1;\n",
		});
		return { r, base, head };
	}

	test("prints the changed text files in the order git lists them", () => {
		const { r, base, head } = threeFileChange();
		const run = pathsRun(r.root, base, head);
		expect(run.code).toBe(0);
		expect(run.result).toMatchObject({ paths: ABC, binary: [], carried: [] });
	});

	test("a renamed file is the old path and the new path, with no braces or arrows", () => {
		const r = gitRepo();
		const base = r.commit({ "src/old.ts": "export const value = 1;\n" });
		r.move("src/old.ts", "src/new.ts");
		const head = r.commit({}, "rename");
		const { result } = pathsRun(r.root, base, head);
		expect([...result.paths].sort()).toEqual(["src/new.ts", "src/old.ts"]);
		expect(result.paths.some((path: string) => /=>|[{}]/.test(path))).toBe(
			false,
		);
	});

	test("a non-ASCII path is listed unquoted and matches the same string in a report", () => {
		const r = gitRepo();
		const base = r.commit({ "README.md": "hello\n" });
		const cafe = "src/caf\u00e9.ts";
		const head = r.commit({ [cafe]: "export const c = 1;\n" });
		expect(pathsRun(r.root, base, head).result.paths).toEqual([cafe]);
		const run = coverageRun(
			r.root,
			scratch(),
			base,
			head,
			fullInput([report(CS, cafe), report(TS)]),
		);
		expect(run.code).toBe(0);
		expect(run.result.unexamined).toEqual([]);
		expect(run.result.checkedFiles).toBe(1);
	});

	test("a binary file is listed apart from the text files", () => {
		const r = gitRepo();
		const base = r.commit({ "README.md": "hello\n" });
		const head = r.commit({
			"assets/logo.png": new Uint8Array([0, 1, 2, 0, 255, 0]),
			"src/a.ts": "export const a = 1;\n",
		});
		expect(pathsRun(r.root, base, head).result).toMatchObject({
			paths: ["src/a.ts"],
			binary: ["assets/logo.png"],
		});
	});

	test("a deleted file is a changed file", () => {
		const r = gitRepo();
		const base = r.commit({
			"src/old.ts": "export const old = 1;\n",
			"src/keep.ts": "export const keep = 1;\n",
		});
		const head = r.commit({
			"src/old.ts": null,
			"src/keep.ts": "export const keep = 2;\n",
		});
		expect(pathsRun(r.root, base, head).result.paths).toEqual([
			"src/keep.ts",
			"src/old.ts",
		]);
	});

	test("openspec, delivery and review files are left out", () => {
		const r = gitRepo();
		const base = r.commit({ "README.md": "hello\n" });
		const head = r.commit({
			"src/a.ts": "export const a = 1;\n",
			"openspec/changes/x/proposal.md": "# x\n",
			".delivery/state.json": "{}\n",
			".review/mr-1/notes.md": "notes\n",
		});
		expect(pathsRun(r.root, base, head).result.paths).toEqual(["src/a.ts"]);
	});

	test("a path that holds a line break exits 1, names the path, and writes no artifact", () => {
		const r = gitRepo();
		const base = r.commit({ "README.md": "hello\n" });
		const head = r.commit({
			"src/line\nbreak.ts": "export const x = 1;\n",
			"src/a.ts": "export const a = 1;\n",
		});
		const paths = pathsRun(r.root, base, head);
		expect(paths.code).toBe(1);
		expect(paths.err).toContain("src/line");
		const run = coverageRun(
			r.root,
			scratch(),
			base,
			head,
			fullInput([report(CS, "src/a.ts"), report(TS)]),
		);
		expect(run.code).toBe(1);
		expect(run.err).toContain("src/line");
		expect(run.artifact).toBeUndefined();
	});

	test("the paths the brief is given are the paths the coverage check examines, in the same order", () => {
		const r = gitRepo();
		const base = r.commit({
			"src/old.ts": "export const value = 1;\n",
			"src/gone.ts": "export const gone = 1;\n",
			"README.md": "hello\n",
		});
		r.move("src/old.ts", "src/new.ts");
		const head = r.commit(
			{
				"src/gone.ts": null,
				"src/caf\u00e9.ts": "export const c = 1;\n",
				"src/z.ts": "export const z = 1;\n",
				"assets/logo.png": new Uint8Array([0, 1, 2, 0, 255, 0]),
				"openspec/changes/x/proposal.md": "# x\n",
			},
			"mixed",
		);
		const listed = pathsRun(r.root, base, head).result;
		const checked = coverageRun(
			r.root,
			scratch(),
			base,
			head,
			fullInput([report(CS), report(TS)]),
		);
		expect(checked.code).toBe(0);
		expect(unexaminedPaths(checked.result)).toEqual(listed.paths);
		expect([...listed.paths].sort()).toEqual(
			[
				"src/caf\u00e9.ts",
				"src/gone.ts",
				"src/new.ts",
				"src/old.ts",
				"src/z.ts",
			].sort(),
		);
		expect(checked.result.binary).toEqual(listed.binary);
		expect(listed.binary).toEqual(["assets/logo.png"]);
	});
});

describe("review-fanout coverage", () => {
	function threeFileChange() {
		const r = gitRepo();
		const base = r.commit({ "README.md": "hello\n" });
		const head = r.commit({
			"src/a.ts": "export const a = 1;\n",
			"src/b.ts": "export const b = 1;\n",
			"src/c.ts": "export const c = 1;\n",
		});
		return { r, base, head };
	}

	test("writes the artifact, prints the same JSON, and lists the one file nobody examined", () => {
		const { r, base, head } = threeFileChange();
		const run = coverageRun(
			r.root,
			scratch(),
			base,
			head,
			fullInput([report(CS, "src/a.ts"), report(TS, "src/b.ts")]),
		);
		expect(run.code).toBe(0);
		expect(run.artifact).toEqual(run.result);
		expect(run.artifact).toMatchObject({
			status: "checked",
			scope: "full",
			from: base,
			head,
			earlier: "none",
			checkedFiles: 3,
			needsFocusedPass: ["src/c.ts"],
			stillUnexamined: ["src/c.ts"],
		});
		expect(run.artifact.unexamined).toEqual([
			{ path: "src/c.ts", carried: false, focusedPass: "pending" },
		]);
	});

	test("a changed file the input never names is unexamined because the input holds no path list", () => {
		const { r, base, head } = threeFileChange();
		const run = coverageRun(
			r.root,
			scratch(),
			base,
			head,
			fullInput([report(CS, "src/a.ts"), report(TS)]),
		);
		expect(unexaminedPaths(run.result)).toEqual(["src/b.ts", "src/c.ts"]);
	});

	test("every file examined leaves nothing for a focused pass", () => {
		const { r, base, head } = threeFileChange();
		const run = coverageRun(
			r.root,
			scratch(),
			base,
			head,
			fullInput([report(CS, ...ABC), report(TS)]),
		);
		expect(run.result).toMatchObject({
			unexamined: [],
			needsFocusedPass: [],
			stillUnexamined: [],
		});
	});

	test("a deleted file nobody listed is unexamined", () => {
		const r = gitRepo();
		const base = r.commit({
			"src/old.ts": "export const old = 1;\n",
			"src/keep.ts": "export const keep = 1;\n",
		});
		const head = r.commit({
			"src/old.ts": null,
			"src/keep.ts": "export const keep = 2;\n",
		});
		const run = coverageRun(
			r.root,
			scratch(),
			base,
			head,
			fullInput([report(CS, "src/keep.ts"), report(TS)]),
		);
		expect(unexaminedPaths(run.result)).toEqual(["src/old.ts"]);
	});

	test("a binary file is named in the artifact and never needs a pass", () => {
		const r = gitRepo();
		const base = r.commit({ "README.md": "hello\n" });
		const head = r.commit({
			"assets/logo.png": new Uint8Array([0, 1, 2, 0, 255, 0]),
			"src/a.ts": "export const a = 1;\n",
		});
		const run = coverageRun(
			r.root,
			scratch(),
			base,
			head,
			fullInput([report(CS, "src/a.ts"), report(TS)]),
		);
		expect(run.artifact).toMatchObject({
			binary: ["assets/logo.png"],
			checkedFiles: 1,
			unexamined: [],
			needsFocusedPass: [],
		});
	});

	test("openspec, delivery and review files are not checked even when a lens lists them", () => {
		const r = gitRepo();
		const base = r.commit({ "README.md": "hello\n" });
		const head = r.commit({
			"src/a.ts": "export const a = 1;\n",
			"openspec/changes/x/proposal.md": "# x\n",
			".review/mr-1/notes.md": "notes\n",
		});
		const run = coverageRun(
			r.root,
			scratch(),
			base,
			head,
			fullInput([
				report(CS, "src/a.ts"),
				report(TS, "openspec/changes/x/proposal.md"),
			]),
		);
		expect(run.result.checkedFiles).toBe(1);
		expect(run.result.unexamined).toEqual([]);
	});

	test("a path written with a doubled slash or padded with spaces leaves the file unexamined", () => {
		const { r, base, head } = threeFileChange();
		const run = coverageRun(
			r.root,
			scratch(),
			base,
			head,
			fullInput([
				report(CS, "src//a.ts", " src/b.ts "),
				report(TS, "src/c.ts"),
			]),
		);
		expect(run.code).toBe(0);
		expect(unexaminedPaths(run.result)).toEqual(["src/a.ts", "src/b.ts"]);
	});

	describe("a report that cannot be trusted stops the review and writes nothing", () => {
		const cases: [string, unknown[], string][] = [
			["a planned lens with no report", [report(CS, "src/a.ts")], TS],
			[
				"a report with no examined list",
				[report(CS, "src/a.ts"), { lens: TS }],
				TS,
			],
			[
				"an examined value that is not an array",
				[report(CS, "src/a.ts"), { lens: TS, examined: "src/a.ts" }],
				TS,
			],
			["an empty entry", [report(CS, ""), report(TS)], CS],
			["an absolute path", [report(CS, "/src/a.ts"), report(TS)], CS],
			["a path starting with ./", [report(CS), report(TS, "./src/a.ts")], TS],
			[
				"a path with a line break",
				[report(CS, "src/a.ts\nsrc/b.ts"), report(TS)],
				CS,
			],
			[
				"a path with a NUL character",
				[report(CS), report(TS, "src/a.ts\u0000")],
				TS,
			],
			[
				"a report for a lens the plan did not name",
				[report(CS), report(TS), report("reliability-operations", "src/a.ts")],
				"reliability-operations",
			],
			[
				"two reports for the same lens",
				[report(CS), report(CS, "src/a.ts"), report(TS)],
				CS,
			],
		];
		for (const [name, reports, lens] of cases) {
			test(name, () => {
				const { r, base, head } = threeFileChange();
				const run = coverageRun(
					r.root,
					scratch(),
					base,
					head,
					fullInput(reports),
				);
				expect(run.code).toBe(1);
				expect(run.err).toContain(lens);
				expect(run.artifact).toBeUndefined();
			});
		}

		test("a plan with no lenses but a report", () => {
			const { r, base, head } = threeFileChange();
			const run = coverageRun(r.root, scratch(), base, head, {
				scope: "full",
				plannedLenses: [],
				reports: [report(CS, "src/a.ts")],
			});
			expect(run.code).toBe(1);
			expect(run.artifact).toBeUndefined();
		});
	});

	describe("a delta review", () => {
		function deltaRepo(secondChange: Record<string, string>) {
			const r = gitRepo();
			const base = r.commit({ "README.md": "hello\n" });
			const since = r.commit({
				"src/a.ts": "export const a = 1;\n",
				"src/b.ts": "export const b = 1;\n",
				"src/c.ts": "export const c = 1;\n",
			});
			const head = r.commit(secondChange);
			return { r, base, since, head };
		}
		const bAndC = {
			"src/b.ts": "export const b = 2;\n",
			"src/c.ts": "export const c = 2;\n",
		};
		const aAndB = {
			"src/a.ts": "export const a = 2;\n",
			"src/b.ts": "export const b = 2;\n",
		};

		function earlierReview(
			d: ReturnType<typeof deltaRepo>,
			examined: string[],
		) {
			const run = coverageRun(
				d.r.root,
				scratch(),
				d.base,
				d.since,
				fullInput([report(CS, ...examined), report(TS)]),
			);
			expect(run.code).toBe(0);
			return run.outPath;
		}

		test("checks only the delta paths", () => {
			const d = deltaRepo(bAndC);
			const run = coverageRun(
				d.r.root,
				scratch(),
				d.since,
				d.head,
				deltaInput([report(CS), report(TS)]),
			);
			expect(run.result).toMatchObject({
				scope: "delta",
				from: d.since,
				head: d.head,
				checkedFiles: 2,
			});
			expect(unexaminedPaths(run.result)).toEqual(["src/b.ts", "src/c.ts"]);
		});

		test("a file the earlier review left unexamined is carried in after the delta paths", () => {
			const d = deltaRepo(bAndC);
			const earlier = earlierReview(d, ["src/b.ts", "src/c.ts"]);
			const run = coverageRun(
				d.r.root,
				scratch(),
				d.since,
				d.head,
				deltaInput([report(CS, "src/b.ts"), report(TS)]),
				["--earlier", earlier],
			);
			expect(run.code).toBe(0);
			expect(run.result).toMatchObject({
				scope: "delta",
				earlier: "read",
				checkedFiles: 3,
			});
			expect(run.result.unexamined).toEqual([
				{ path: "src/c.ts", carried: false, focusedPass: "pending" },
				{ path: "src/a.ts", carried: true, focusedPass: "pending" },
			]);
			const listed = pathsRun(d.r.root, d.since, d.head, "--earlier", earlier);
			expect(listed.result.paths).toEqual(["src/b.ts", "src/c.ts", "src/a.ts"]);
			expect(listed.result.carried).toEqual(["src/a.ts"]);
		});

		test("a carried file that is also a delta path is checked once", () => {
			const d = deltaRepo(aAndB);
			const earlier = earlierReview(d, ["src/b.ts", "src/c.ts"]);
			const run = coverageRun(
				d.r.root,
				scratch(),
				d.since,
				d.head,
				deltaInput([report(CS, "src/b.ts"), report(TS)]),
				["--earlier", earlier],
			);
			expect(run.result.checkedFiles).toBe(2);
			expect(unexaminedPaths(run.result)).toEqual(["src/a.ts"]);
		});

		test("an earlier artifact that does not exist carries nothing and is recorded as none", () => {
			const d = deltaRepo(bAndC);
			const run = coverageRun(
				d.r.root,
				scratch(),
				d.since,
				d.head,
				deltaInput([report(CS, "src/b.ts"), report(TS)]),
				["--earlier", join(scratch(), "lens-coverage.json")],
			);
			expect(run.code).toBe(0);
			expect(run.result.earlier).toBe("none");
			expect(unexaminedPaths(run.result)).toEqual(["src/c.ts"]);
		});

		test("an earlier artifact that was skipped carries nothing", () => {
			const d = deltaRepo(bAndC);
			const skipped = coverageRun(d.r.root, scratch(), d.base, d.since, {
				scope: "full",
				plannedLenses: [],
				reports: [],
			});
			expect(skipped.result.status).toBe("skipped");
			const run = coverageRun(
				d.r.root,
				scratch(),
				d.since,
				d.head,
				deltaInput([report(CS, "src/b.ts"), report(TS)]),
				["--earlier", skipped.outPath],
			);
			expect(run.code).toBe(0);
			expect(unexaminedPaths(run.result)).toEqual(["src/c.ts"]);
		});

		test("an earlier artifact for another head exits 1 and writes nothing", () => {
			const d = deltaRepo(bAndC);
			const otherHead = coverageRun(
				d.r.root,
				scratch(),
				d.base,
				d.head,
				fullInput([report(CS, ...ABC), report(TS)]),
			);
			const run = coverageRun(
				d.r.root,
				scratch(),
				d.since,
				d.head,
				deltaInput([report(CS), report(TS)]),
				["--earlier", otherHead.outPath],
			);
			expect(run.code).toBe(1);
			expect(run.artifact).toBeUndefined();
		});

		test("an earlier artifact that cannot be read exits 1 and writes nothing", () => {
			const d = deltaRepo(bAndC);
			const broken = join(scratch(), "lens-coverage.json");
			writeFileSync(broken, "{not json");
			const run = coverageRun(
				d.r.root,
				scratch(),
				d.since,
				d.head,
				deltaInput([report(CS), report(TS)]),
				["--earlier", broken],
			);
			expect(run.code).toBe(1);
			expect(run.artifact).toBeUndefined();
		});
	});

	describe("focused pass outcomes", () => {
		const reports = [report(CS, "src/a.ts"), report(TS)];

		function firstCheck() {
			const { r, base, head } = threeFileChange();
			const work = scratch();
			const first = coverageRun(r.root, work, base, head, fullInput(reports));
			expect(first.result.needsFocusedPass).toEqual(["src/b.ts", "src/c.ts"]);
			const again = (input: unknown) =>
				coverageRun(r.root, work, base, head, input);
			return { r, base, head, work, first, again };
		}

		test("records examined for a pass that lists its own file and failed for one that does not", () => {
			const { again } = firstCheck();
			const run = again(
				fullInput(reports, [
					returned("src/b.ts", "src/b.ts"),
					returned("src/c.ts", "src/a.ts"),
				]),
			);
			expect(run.code).toBe(0);
			expect(passesByPath(run.artifact)).toEqual({
				"src/b.ts": "examined",
				"src/c.ts": "failed",
			});
			expect(run.artifact.needsFocusedPass).toEqual([]);
			expect(run.artifact.stillUnexamined).toEqual(["src/c.ts"]);
		});

		test("a failed pass leaves the file in the still-unexamined list and the command still succeeds", () => {
			const { again } = firstCheck();
			const run = again(fullInput(reports, [failed("src/b.ts")]));
			expect(run.code).toBe(0);
			expect(run.artifact.stillUnexamined).toEqual(["src/b.ts", "src/c.ts"]);
			expect(run.artifact.needsFocusedPass).toEqual(["src/c.ts"]);
		});

		test("a recorded pass is not asked again after a later lens lists that file and then drops it", () => {
			const { again } = firstCheck();
			again(
				fullInput(reports, [
					failed("src/b.ts"),
					returned("src/c.ts", "src/c.ts"),
				]),
			);
			const listed = [report(CS, "src/a.ts", "src/b.ts"), report(TS)];
			again(fullInput(listed));
			const resumed = again(fullInput(reports));
			expect(resumed.code).toBe(0);
			expect(passesByPath(resumed.artifact)["src/b.ts"]).toBe("failed");
			expect(passesByPath(resumed.artifact)["src/c.ts"]).toBe("examined");
			expect(resumed.artifact.needsFocusedPass).toEqual([]);
		});

		test("a resumed review with fresh lens reports dispatches only files without a recorded outcome", () => {
			const { again } = firstCheck();
			again(fullInput(reports, [failed("src/b.ts")]));
			const resumed = again(fullInput(reports));
			expect(resumed.code).toBe(0);
			expect(resumed.artifact.needsFocusedPass).toEqual(["src/c.ts"]);
			expect(passesByPath(resumed.artifact)["src/b.ts"]).toBe("failed");
		});

		const refused: [string, unknown[], string][] = [
			[
				"an outcome for a file no lens left unexamined",
				[failed("src/a.ts")],
				"src/a.ts",
			],
			[
				"an outcome for a file outside the change",
				[failed("src/z.ts")],
				"src/z.ts",
			],
			[
				"two outcomes for one file",
				[failed("src/b.ts"), returned("src/b.ts", "src/b.ts")],
				"src/b.ts",
			],
			[
				"a failed outcome that carries a list",
				[{ path: "src/b.ts", status: "failed", examined: ["src/b.ts"] }],
				"src/b.ts",
			],
			[
				"a returned outcome with no list",
				[{ path: "src/b.ts", status: "returned" }],
				"src/b.ts",
			],
			[
				"a returned outcome with a malformed list",
				[returned("src/b.ts", "")],
				"src/b.ts",
			],
		];
		for (const [name, focused, path] of refused) {
			test(`${name} exits 1 and leaves the artifact byte for byte unchanged`, () => {
				const { work, again } = firstCheck();
				const before = readFileSync(join(work, "lens-coverage.json"));
				const run = again(fullInput(reports, focused));
				expect(run.code).toBe(1);
				expect(run.err).toContain(path);
				expect(
					readFileSync(join(work, "lens-coverage.json")).equals(before),
				).toBe(true);
			});
		}

		test("a second outcome for a file the artifact already recorded is refused, whether it was examined or failed", () => {
			const { work, again } = firstCheck();
			again(
				fullInput(reports, [
					returned("src/b.ts", "src/b.ts"),
					failed("src/c.ts"),
				]),
			);
			const before = readFileSync(join(work, "lens-coverage.json"));
			for (const outcome of [
				failed("src/b.ts"),
				returned("src/b.ts", "src/b.ts"),
				returned("src/c.ts", "src/c.ts"),
			]) {
				const run = again(fullInput(reports, [outcome]));
				expect(run.code).toBe(1);
				expect(
					readFileSync(join(work, "lens-coverage.json")).equals(before),
				).toBe(true);
			}
			expect(again(fullInput(reports)).artifact.needsFocusedPass).toEqual([]);
		});

		test("an artifact recorded for another head exits 1 and is left unchanged", () => {
			const r = gitRepo();
			const base = r.commit({ "README.md": "hello\n" });
			const first = r.commit({ "src/a.ts": "export const a = 1;\n" });
			const second = r.commit({ "src/b.ts": "export const b = 1;\n" });
			const work = scratch();
			const input = fullInput([report(CS), report(TS)]);
			expect(coverageRun(r.root, work, base, first, input).code).toBe(0);
			const before = readFileSync(join(work, "lens-coverage.json"));
			const run = coverageRun(r.root, work, base, second, input);
			expect(run.code).toBe(1);
			expect(
				readFileSync(join(work, "lens-coverage.json")).equals(before),
			).toBe(true);
		});
	});

	describe("a review where no lens ran", () => {
		const emptyPlan = { scope: "full", plannedLenses: [], reports: [] };

		test("writes a skipped artifact without calling git", () => {
			const notARepo = scratch("review-coverage-nogit-");
			const run = coverageRun(
				notARepo,
				scratch(),
				"no-such-base",
				"no-such-head",
				emptyPlan,
			);
			expect(run.code).toBe(0);
			expect(run.artifact).toMatchObject({
				status: "skipped",
				scope: "full",
				reason: "no lens ran, so there is nothing to check",
				checkedFiles: 0,
				unexamined: [],
				needsFocusedPass: [],
				stillUnexamined: [],
			});
		});

		test("adds no second entry to the skipped workers record", () => {
			const root = scratch("review-coverage-skip-");
			const reviewDir = join(root, ".review", "mr-1");
			const headDir = join(reviewDir, "c".repeat(40));
			mkdirSync(headDir, { recursive: true });
			const skippedWorkers = JSON.stringify({
				skips: [
					{
						skipId: "review-lens",
						worker: "review-lens",
						reason: "no reviewable code in the pinned diff",
					},
				],
			});
			writeFileSync(join(reviewDir, "skipped-workers.json"), skippedWorkers);
			writeFileSync(
				join(headDir, "lens-coverage-input.json"),
				JSON.stringify(emptyPlan),
			);
			const run = fanout(
				root,
				"coverage",
				"no-such-base",
				"c".repeat(40),
				join(headDir, "lens-coverage-input.json"),
				join(headDir, "lens-coverage.json"),
			);
			expect(run.code).toBe(0);
			expect(
				readFileSync(join(reviewDir, "skipped-workers.json"), "utf8"),
			).toBe(skippedWorkers);
			expect(readdirSync(reviewDir).sort()).toEqual([
				"c".repeat(40),
				"skipped-workers.json",
			]);
			expect(readdirSync(headDir).sort()).toEqual([
				"lens-coverage-input.json",
				"lens-coverage.json",
			]);
		});
	});
});
