import { afterEach, describe, expect, setDefaultTimeout, test } from "bun:test";
import {
	chmodSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	readdirSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
	REJECTIONS_BUDGET_CHARS,
	REVIEW_MEMORY_FILTER_INVOCATION,
	REVIEW_MEMORY_RECORD_INVOCATION,
	ReviewMemory,
} from "./review-memory";
import { EVIDENCE_TAIL_CHARS, buildReviewPacket } from "./review-packet";
import { readVerdict } from "./review-scope";

setDefaultTimeout(60_000);

const SCRIPT = join(import.meta.dir, "review-memory.ts");
const IID = "840";
const PRIOR = "prior-rejection-at-location";

const dirs: string[] = [];
afterEach(() => {
	for (const dir of dirs.splice(0))
		rmSync(dir, { recursive: true, force: true });
});

function scratchDir(): string {
	const dir = mkdtempSync(join(tmpdir(), "review-memory-scratch-"));
	dirs.push(dir);
	return dir;
}

function scratchFile(name: string, body: string): string {
	const file = join(scratchDir(), name);
	writeFileSync(file, body);
	return file;
}

type Files = Record<string, string | null>;

function repo() {
	const root = mkdtempSync(join(tmpdir(), "review-memory-"));
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
	const commit = (files: Files, message = "change") => {
		for (const [path, text] of Object.entries(files)) {
			const full = join(root, path);
			if (text === null) {
				rmSync(full, { force: true });
				continue;
			}
			mkdirSync(dirname(full), { recursive: true });
			writeFileSync(full, text);
		}
		run("add", "-A", "--", ".");
		run("commit", "--quiet", "-m", message);
		return run("rev-parse", "HEAD");
	};
	const checkout = (sha: string) => run("checkout", "--quiet", "--detach", sha);
	return { root, run, commit, checkout };
}

type Repo = ReturnType<typeof repo>;

function numbered(size: number, blocks: Record<number, string[]> = {}): string {
	const out = Array.from(
		{ length: size },
		(_, index) => `export const filler${index + 1} = ${index + 1};`,
	);
	for (const [start, block] of Object.entries(blocks)) {
		block.forEach((text, index) => {
			out[Number(start) - 1 + index] = text;
		});
	}
	return `${out.join("\n")}\n`;
}

const PARSE = [
	"export function parse(input: string): string {",
	"\t// keep the first field",
	'\tconst first = input.split(",")[0];',
	"\treturn first.trim();",
	"}",
];
const PARSE_NORMALISED = [
	"export function parse(input: string): string {",
	"// keep the first field",
	'const first = input.split(",")[0];',
	"return first.trim();",
	"}",
];
const PARSE_FILE = numbered(44, { 10: PARSE });
const CALLER_CHECK =
	'\tif (input.length === 0) throw new Error("empty input");';
const CALLER_FILE = [
	'import { parse } from "./parse";',
	"",
	"export function run(input: string): string {",
	CALLER_CHECK,
	"\treturn parse(input);",
	"}",
	"",
].join("\n");
const CALLER_WITHOUT_CHECK = CALLER_FILE.replace(`${CALLER_CHECK}\n`, "");
const CALLER_GUARD_NORMALISED = [
	"export function run(input: string): string {",
	'if (input.length === 0) throw new Error("empty input");',
	"return parse(input);",
];
const OTHER_FILE = [
	"export function other(value: number): number {",
	"\tconst doubled = value * 2;",
	"\treturn doubled;",
	"}",
	"",
].join("\n");

function base() {
	const r = repo();
	const h1 = r.commit({
		".gitignore": ".review/\n",
		"README.md": "readme\n",
		"src/parse.ts": PARSE_FILE,
		"src/caller.ts": CALLER_FILE,
		"src/other.ts": OTHER_FILE,
		"src/big.ts": numbered(120),
	});
	return { ...r, h1 };
}

const TITLE = "Parse crashes on empty input";
const REASON = "The caller rejects empty input before parse is reached.";

function disproved(extra: Record<string, unknown> = {}) {
	return {
		title: TITLE,
		path: "src/parse.ts",
		line: 12,
		startLine: 10,
		endLine: 14,
		reason: REASON,
		...extra,
	};
}

const CALLER_GUARD = { path: "src/caller.ts", startLine: 3, endLine: 5 };

function disprovedOther(extra: Record<string, unknown> = {}) {
	return {
		title: "Other doubles twice",
		path: "src/other.ts",
		line: 2,
		startLine: 1,
		endLine: 3,
		reason: "Doubling happens once in this function.",
		...extra,
	};
}

interface Run {
	code: number;
	out: string;
	err: string;
}

function cli(args: string[], env: Record<string, string> = {}): Run {
	const proc = Bun.spawnSync(["bun", SCRIPT, ...args], {
		stdout: "pipe",
		stderr: "pipe",
		env: { ...process.env, ...env },
	});
	return {
		code: proc.exitCode ?? -1,
		out: proc.stdout.toString(),
		err: proc.stderr.toString(),
	};
}

const said = (run: Run) => `${run.out}\n${run.err}`;

function record(
	r: Repo,
	head: string,
	outcome: unknown,
	iid = IID,
	env: Record<string, string> = {},
): Run {
	const file = scratchFile(
		"outcome.json",
		typeof outcome === "string" ? outcome : JSON.stringify(outcome),
	);
	return cli(["record", r.root, iid, head, file], env);
}

function filter(
	r: Repo,
	head: string,
	candidates: unknown,
	iid = IID,
	env: Record<string, string> = {},
): Run {
	const file = scratchFile(
		"candidates.json",
		typeof candidates === "string" ? candidates : JSON.stringify(candidates),
	);
	return cli(["filter", r.root, iid, head, file], env);
}

interface FilterResult {
	id: string;
	path: string;
	line?: number;
	status: string;
	cause?: string;
}
interface Listed {
	ref: string;
	title: string;
	reason: string;
	recordedHead: string;
	startLine: number;
	endLine: number;
}
interface FilterOutput {
	head: string;
	results: FilterResult[];
	rejections: Array<{ id: string; omitted: number; items: Listed[] }>;
}

function cand(id: string, path: string, line?: number, endLine?: number) {
	return {
		id,
		path,
		...(line === undefined ? {} : { line }),
		...(endLine === undefined ? {} : { endLine }),
	};
}

function filtered(
	r: Repo,
	head: string,
	candidates: ReturnType<typeof cand>[],
	iid = IID,
): FilterOutput {
	const run = filter(r, head, { candidates }, iid);
	if (run.code !== 0) throw new Error(run.err);
	return JSON.parse(run.out) as FilterOutput;
}

function settle(
	r: Repo,
	head: string,
	candidates: ReturnType<typeof cand>[],
	iid = IID,
): FilterOutput {
	const run = filter(r, head, { candidates }, iid);
	if (run.code !== 0) throw new Error(run.err);
	const dir = join(r.root, ".review", `mr-${iid}`, head);
	mkdirSync(dir, { recursive: true });
	writeFileSync(join(dir, "memory-filter.json"), run.out);
	return JSON.parse(run.out) as FilterOutput;
}

const result = (out: FilterOutput, id: string) => {
	const found = out.results.find((item) => item.id === id);
	if (!found) throw new Error(`no result for ${id}`);
	return found;
};
const listed = (out: FilterOutput, id: string): Listed[] =>
	out.rejections.find((item) => item.id === id)?.items ?? [];

function seed(r: Repo, head: string, ...items: object[]) {
	const run = record(r, head, { disproved: items });
	if (run.code !== 0) throw new Error(run.err);
}

interface StoredRejection {
	title: string;
	reason: string;
	recordedHead: string;
	startLine: number;
	endLine: number;
	guards: Array<{ path: string; code: string[] }>;
}
interface StoredEntry {
	path: string;
	code: string[];
	rejections: StoredRejection[];
}
interface Stored {
	version: number;
	entries: StoredEntry[];
}

const mrDir = (r: Repo, iid = IID) => join(r.root, ".review", `mr-${iid}`);
const memoryFile = (r: Repo, iid = IID) => join(mrDir(r, iid), "rejected.json");
const memoryBytes = (r: Repo, iid = IID) =>
	existsSync(memoryFile(r, iid))
		? readFileSync(memoryFile(r, iid), "utf8")
		: undefined;

function stored(r: Repo, iid = IID): StoredEntry[] {
	const text = memoryBytes(r, iid);
	if (text === undefined) return [];
	const json = JSON.parse(text) as Stored;
	expect(ReviewMemory.safeParse(json).success).toBe(true);
	expect(json.version).toBe(1);
	return json.entries;
}

function plantMemory(r: Repo, text: string, iid = IID) {
	mkdirSync(mrDir(r, iid), { recursive: true });
	writeFileSync(memoryFile(r, iid), text);
}

function refOf(out: FilterOutput, id: string, title: string): string {
	const found = listed(out, id).find((item) => item.title === title);
	if (!found) throw new Error(`no listed rejection ${title} for ${id}`);
	return found.ref;
}

function bulletFor(run: Run): string {
	return (JSON.parse(run.out) as { previouslyDisproved: string })
		.previouslyDisproved;
}

describe("recording a disproved candidate", () => {
	test("stores the reason and the cited code as committed, directly under the merge request's directory", () => {
		const r = base();
		const run = record(r, r.h1, { disproved: [disproved()] });
		expect(run.code).toBe(0);
		expect(JSON.parse(run.out)).toMatchObject({ recorded: 1, reversed: 0 });
		const entries = stored(r);
		expect(entries).toHaveLength(1);
		expect(entries[0]).toMatchObject({
			path: "src/parse.ts",
			code: PARSE_NORMALISED,
			rejections: [
				{
					title: TITLE,
					reason: REASON,
					recordedHead: r.h1,
					startLine: 10,
					endLine: 14,
					guards: [],
				},
			],
		});
		expect(existsSync(join(mrDir(r), r.h1, "rejected.json"))).toBe(false);
		const files = readdirSync(mrDir(r), { withFileTypes: true })
			.filter((entry) => entry.isFile())
			.map((entry) => entry.name);
		expect(files).toEqual(["rejected.json"]);
	});

	test("reads the cited code from the pinned head and not from the working tree", () => {
		const r = base();
		writeFileSync(
			join(r.root, "src/parse.ts"),
			PARSE_FILE.replace("first.trim()", "first.toUpperCase()"),
		);
		expect(record(r, r.h1, { disproved: [disproved()] }).code).toBe(0);
		expect(stored(r)[0]?.code).toEqual(PARSE_NORMALISED);
	});

	test("a second rejection at the same place joins the entry and an identical title replaces its earlier rejection", () => {
		const r = base();
		seed(r, r.h1, disproved());
		const before = stored(r)[0]?.rejections[0];
		const h2 = r.commit({ "README.md": "readme 2\n" });

		seed(
			r,
			h2,
			disproved({
				title: "Parse trims twice",
				reason: "Trim is applied once.",
				guards: [CALLER_GUARD],
			}),
		);
		const joined = stored(r);
		expect(joined).toHaveLength(1);
		expect(joined[0]?.rejections).toHaveLength(2);
		expect(joined[0]?.rejections.find((item) => item.title === TITLE)).toEqual(
			before as StoredRejection,
		);
		expect(
			joined[0]?.rejections.find((item) => item.title === "Parse trims twice"),
		).toMatchObject({
			recordedHead: h2,
		});

		seed(r, h2, disproved({ reason: "A newer reason for the same title." }));
		const replaced = stored(r)[0]?.rejections ?? [];
		expect(replaced).toHaveLength(2);
		expect(replaced.find((item) => item.title === TITLE)).toMatchObject({
			reason: "A newer reason for the same title.",
			recordedHead: h2,
		});
	});

	test("code that moved is the same entry, and the new rejection records where it now stands", () => {
		const r = base();
		seed(r, r.h1, disproved());
		const above = Array.from({ length: 6 }, (_, i) => `// added ${i + 1}`);
		const h2 = r.commit({
			"src/parse.ts": `${above.join("\n")}\n${PARSE_FILE}`,
		});
		seed(
			r,
			h2,
			disproved({
				title: "Parse splits wrongly",
				line: 18,
				startLine: 16,
				endLine: 20,
			}),
		);
		const entries = stored(r);
		expect(entries).toHaveLength(1);
		expect(
			entries[0]?.rejections.find(
				(item) => item.title === "Parse splits wrongly",
			),
		).toMatchObject({ startLine: 16, endLine: 20, recordedHead: h2 });
	});

	test("an entry keeps only its five newest rejections", () => {
		const r = base();
		for (let n = 1; n <= 6; n++) {
			seed(r, r.h1, disproved({ title: `Claim ${n}`, reason: `Reason ${n}.` }));
		}
		const titles = (stored(r)[0]?.rejections ?? []).map((item) => item.title);
		expect(titles).toHaveLength(5);
		expect(titles).not.toContain("Claim 1");
		expect(titles).toContain("Claim 6");
	});

	test("two disproved candidates at one location in one outcome are both stored", () => {
		const r = base();
		expect(
			record(r, r.h1, {
				disproved: [
					disproved(),
					disproved({
						title: "Parse splits wrongly",
						reason: "It splits once.",
					}),
				],
			}).code,
		).toBe(0);
		expect(stored(r)).toHaveLength(1);
		expect(stored(r)[0]?.rejections).toHaveLength(2);
	});

	test("a rejection stores the normalised lines of the guard it rests on", () => {
		const r = base();
		const run = record(r, r.h1, {
			disproved: [disproved({ guards: [CALLER_GUARD] })],
		});
		expect(run.code).toBe(0);
		expect(stored(r)[0]?.rejections[0]?.guards).toEqual([
			{ path: "src/caller.ts", code: CALLER_GUARD_NORMALISED },
		]);
	});

	test("a range of exactly 80 lines is accepted", () => {
		const r = base();
		const run = record(r, r.h1, {
			disproved: [
				disproved({ path: "src/big.ts", line: 5, startLine: 1, endLine: 80 }),
			],
		});
		expect(run.code).toBe(0);
		expect(stored(r)[0]?.code).toHaveLength(80);
	});

	test("an empty outcome records nothing and creates no memory file", () => {
		const r = base();
		const run = record(r, r.h1, {});
		expect(run.code).toBe(0);
		expect(JSON.parse(run.out)).toMatchObject({
			recorded: 0,
			reversed: 0,
			previouslyDisproved: "",
		});
		expect(existsSync(join(r.root, ".review"))).toBe(false);
	});
});

describe("refusing an outcome that cannot be trusted", () => {
	test("leaves the memory byte for byte as it was and stores none of the outcome", () => {
		const r = base();
		seed(r, r.h1, disproved());
		const before = memoryBytes(r);
		const listing = readdirSync(mrDir(r)).sort();
		const run = record(r, r.h1, {
			disproved: [
				disprovedOther(),
				disproved({ title: "Missing file claim", path: "src/missing.ts" }),
			],
		});
		expect(run.code).toBe(3);
		expect(said(run)).toContain("disproved candidate 2");
		expect(said(run)).toContain("src/missing.ts");
		expect(said(run)).toMatch(/not found/i);
		expect(said(run)).not.toContain("disproved candidate 1");
		expect(memoryBytes(r)).toBe(before);
		expect(readdirSync(mrDir(r)).sort()).toEqual(listing);
		expect(stored(r).map((entry) => entry.path)).toEqual(["src/parse.ts"]);
	});

	test("names every refused item at once, in plain words, and not the valid one", () => {
		const r = base();
		settle(r, r.h1, [cand("c1", "src/other.ts", 2)]);
		const run = record(r, r.h1, {
			disproved: [
				disproved({ path: "src/missing.ts" }),
				disproved({ title: "Out of range", line: 30 }),
				disprovedOther(),
			],
			droppedAsPreviouslyDisproved: [{ id: "c1", rejection: "0".repeat(12) }],
		});
		expect(run.code).toBe(3);
		const text = said(run);
		expect(text).toContain("disproved candidate 1");
		expect(text).toContain("disproved candidate 2");
		expect(text).toContain("dropped candidate 1");
		expect(text).not.toContain("disproved candidate 3");
		expect(text).not.toMatch(
			/droppedAsPreviouslyDisproved|startLine|endLine|"line"|guards/,
		);
		expect(memoryBytes(r)).toBeUndefined();
	});

	test("a cited line outside the range read is refused in plain words and creates no file", () => {
		const r = base();
		const run = record(r, r.h1, { disproved: [disproved({ line: 30 })] });
		expect(run.code).toBe(3);
		expect(said(run)).toMatch(/cited line is not inside the range/i);
		expect(memoryBytes(r)).toBeUndefined();
	});

	const refused: Array<[string, Record<string, unknown>]> = [
		[
			"a range of 81 lines",
			{ path: "src/big.ts", line: 5, startLine: 1, endLine: 81 },
		],
		["an empty reason", { reason: "" }],
		["an empty title", { title: "" }],
		["a title over 200 characters", { title: "t".repeat(201) }],
		["a reason over 600 characters", { reason: "r".repeat(601) }],
		["a path outside the repository", { path: "../outside.ts" }],
		["an absolute path", { path: "/etc/passwd" }],
		["a path with a leading dot slash", { path: "./src/parse.ts" }],
		[
			"a range past the end of the file",
			{ startLine: 40, endLine: 99, line: 41 },
		],
		["a path that is absent at the head", { path: "src/absent.ts" }],
		[
			"more than 3 guards",
			{ guards: [CALLER_GUARD, CALLER_GUARD, CALLER_GUARD, CALLER_GUARD] },
		],
		[
			"a guard range of 81 lines",
			{ guards: [{ path: "src/big.ts", startLine: 1, endLine: 81 }] },
		],
		[
			"a guard in a file that is absent at the head",
			{ guards: [{ path: "src/absent.ts", startLine: 1, endLine: 2 }] },
		],
		[
			"a guard with an unsafe path",
			{ guards: [{ path: "../caller.ts", startLine: 3, endLine: 5 }] },
		],
	];
	for (const [name, change] of refused) {
		test(`refuses ${name} with exit 3 and writes nothing`, () => {
			const r = base();
			const run = record(r, r.h1, { disproved: [disproved(change)] });
			expect(run.code).toBe(3);
			expect(said(run)).toContain("disproved candidate 1");
			expect(memoryBytes(r)).toBeUndefined();
		});
	}

	test("an outcome that is not valid JSON, or has an unknown key, exits 3 and leaves the memory alone", () => {
		const r = base();
		seed(r, r.h1, disproved());
		const before = memoryBytes(r);
		for (const outcome of [
			"not json",
			{ disproved: [], surprise: true },
			{ disproved: [disproved()], extra: [] },
			{ disproved: [disproved({ confidence: "high" })] },
		]) {
			const run = record(r, r.h1, outcome);
			expect(run.code).toBe(3);
			expect(said(run).trim().length).toBeGreaterThan(0);
			expect(memoryBytes(r)).toBe(before);
		}
	});

	test("an unknown head, and a head that is not a full SHA, exit 1 with their own messages", () => {
		const r = base();
		const outcome = { disproved: [disproved()] };
		const unknown = record(r, "c".repeat(40), outcome);
		const short = record(r, "abc123", outcome);
		expect(unknown.code).toBe(1);
		expect(short.code).toBe(1);
		expect(unknown.err.trim().length).toBeGreaterThan(0);
		expect(short.err.trim().length).toBeGreaterThan(0);
		expect(unknown.err).not.toBe(short.err);
		expect(memoryBytes(r)).toBeUndefined();
	});

	test("a corrected outcome is recorded in full", () => {
		const r = base();
		const second = disprovedOther();
		const wrong = { disproved: [disproved({ line: 30 }), second] };
		expect(record(r, r.h1, wrong).code).toBe(3);
		expect(memoryBytes(r)).toBeUndefined();
		const fixed = { disproved: [disproved(), second] };
		expect(record(r, r.h1, fixed).code).toBe(0);
		expect(
			stored(r)
				.map((entry) => entry.path)
				.sort(),
		).toEqual(["src/other.ts", "src/parse.ts"]);
	});

	test("removing the items that stay refused leaves an outcome that records the rest", () => {
		const r = base();
		const filterOut = settle(r, r.h1, [cand("c1", "src/parse.ts", 12)]);
		expect(result(filterOut, "c1").status).toBe("fresh");
		const kept = disprovedOther();
		const outcome = {
			disproved: [disproved({ path: "src/missing.ts" }), kept],
			reversed: [{ id: "c1", rejection: "0".repeat(12) }],
		};
		const refusedRun = record(r, r.h1, outcome);
		expect(refusedRun.code).toBe(3);
		expect(said(refusedRun)).toContain("disproved candidate 1");
		expect(memoryBytes(r)).toBeUndefined();

		const trimmed = record(r, r.h1, { disproved: [kept] });
		expect(trimmed.code).toBe(0);
		expect(stored(r).map((entry) => entry.path)).toEqual(["src/other.ts"]);
	});
});

describe("reporting a prior rejection at unchanged code", () => {
	test("lists the remembered title, reason, and head for a candidate inside the cited code, and keeps every candidate", () => {
		const r = base();
		seed(r, r.h1, disproved());
		const h2 = r.commit({ "README.md": "readme 2\n" });
		const run = filter(r, h2, {
			candidates: [
				cand("c1", "src/parse.ts", 12),
				cand("c2", "src/other.ts", 2),
			],
		});
		expect(run.code).toBe(0);
		const out = JSON.parse(run.out) as FilterOutput;
		expect(out.head).toBe(h2);
		expect(out.results.map((item) => item.id)).toEqual(["c1", "c2"]);
		expect(result(out, "c1")).toMatchObject({
			path: "src/parse.ts",
			line: 12,
			status: PRIOR,
		});
		expect(result(out, "c1")).not.toHaveProperty("cause");
		expect(listed(out, "c1")).toEqual([
			{
				ref: expect.stringMatching(/^[0-9a-f]{12}$/),
				title: TITLE,
				reason: REASON,
				recordedHead: r.h1,
				startLine: 10,
				endLine: 14,
			},
		]);
		expect(result(out, "c2")).toMatchObject({ status: "fresh" });
		expect(Object.keys(out).at(-1)).toBe("rejections");
	});

	test("never writes", () => {
		const r = base();
		seed(r, r.h1, disproved());
		const before = memoryBytes(r);
		const listing = readdirSync(r.root).sort();
		filtered(r, r.h1, [cand("c1", "src/parse.ts", 12)]);
		expect(memoryBytes(r)).toBe(before);
		expect(readdirSync(r.root).sort()).toEqual(listing);
		expect(readdirSync(mrDir(r))).toEqual(["rejected.json"]);
	});

	test("code that moved down the file is still unchanged, and the old line number no longer matches", () => {
		const r = base();
		seed(r, r.h1, disproved());
		const above = Array.from({ length: 6 }, (_, i) => `// added ${i + 1}`);
		const h2 = r.commit({
			"src/parse.ts": `${above.join("\n")}\n${PARSE_FILE}`,
		});
		const out = filtered(r, h2, [
			cand("c1", "src/parse.ts", 17),
			cand("c2", "src/parse.ts", 12),
		]);
		expect(result(out, "c1").status).toBe(PRIOR);
		expect(result(out, "c2")).toMatchObject({
			status: "fresh",
			cause: "cited-code-changed",
		});
	});

	test("a whitespace-only edit inside the cited code is still unchanged", () => {
		const r = base();
		seed(r, r.h1, disproved());
		const reindented = [
			"export function parse(input: string): string {   ",
			"        // keep   the first field",
			'        const  first =   input.split(",")[0];  ',
			"        return first.trim();",
			"}",
		];
		const h2 = r.commit({ "src/parse.ts": numbered(44, { 10: reindented }) });
		expect(
			result(filtered(r, h2, [cand("c1", "src/parse.ts", 12)]), "c1").status,
		).toBe(PRIOR);
	});

	test("blank lines inside the cited code do not make it changed", () => {
		const r = base();
		seed(r, r.h1, disproved());
		const spaced = [
			PARSE[0],
			"",
			PARSE[1],
			PARSE[2],
			"   ",
			PARSE[3],
			PARSE[4],
		];
		const h2 = r.commit({
			"src/parse.ts": numbered(44, { 10: spaced as string[] }),
		});
		expect(
			result(filtered(r, h2, [cand("c1", "src/parse.ts", 13)]), "c1").status,
		).toBe(PRIOR);
	});

	test("an edit to a comment inside the cited code counts as a change", () => {
		const r = base();
		seed(r, r.h1, disproved());
		const h2 = r.commit({
			"src/parse.ts": PARSE_FILE.replace(
				"keep the first field",
				"keep the head",
			),
		});
		expect(
			result(filtered(r, h2, [cand("c1", "src/parse.ts", 12)]), "c1"),
		).toMatchObject({
			status: "fresh",
			cause: "cited-code-changed",
		});
	});

	test("matches on the path and the code alone, for a line or any part of a line range", () => {
		const r = base();
		seed(r, r.h1, disproved());
		const out = filtered(r, r.h1, [
			cand("c1", "src/parse.ts", 8, 10),
			cand("c2", "src/parse.ts", 14, 20),
			cand("c3", "src/parse.ts", 15, 20),
			cand("c4", "src/parse.ts", 1, 9),
		]);
		expect(out.results.map((item) => item.status)).toEqual([
			PRIOR,
			PRIOR,
			"fresh",
			"fresh",
		]);
		expect(listed(out, "c1")[0]?.title).toBe(TITLE);
	});

	test("the report is the same when the scope of the review is delta", () => {
		const r = base();
		seed(r, r.h1, disproved());
		const h2 = r.commit({ "src/other.ts": `${OTHER_FILE}// later\n` });
		const candidates = [cand("c1", "src/parse.ts", 12)];
		const without = filter(r, h2, { candidates });
		const dir = join(mrDir(r), h2);
		mkdirSync(dir, { recursive: true });
		writeFileSync(
			join(dir, "review-scope.json"),
			JSON.stringify({
				scope: "delta",
				since: r.h1,
				previous: r.h1,
				reasons: ["Only 1 file changed."],
			}),
		);
		const withScope = filter(r, h2, { candidates });
		expect(withScope.code).toBe(0);
		expect(withScope.out).toBe(without.out);
		expect(result(JSON.parse(withScope.out) as FilterOutput, "c1").status).toBe(
			PRIOR,
		);
	});

	test("the same code in two places attaches the reason only to the place anchored in", () => {
		const r = base();
		seed(r, r.h1, disproved());
		const h2 = r.commit({
			"src/parse.ts": numbered(70, { 10: PARSE, 60: PARSE }),
		});
		const out = filtered(r, h2, [
			cand("c1", "src/parse.ts", 62),
			cand("c2", "src/parse.ts", 30),
		]);
		expect(result(out, "c1").status).toBe(PRIOR);
		expect(result(out, "c2")).toMatchObject({
			status: "fresh",
			cause: "cited-code-changed",
		});
	});

	test("lists the newest rejection first", () => {
		const r = base();
		seed(r, r.h1, disproved());
		const h2 = r.commit({ "README.md": "readme 2\n" });
		seed(r, h2, disproved({ title: "Parse splits wrongly", reason: "Once." }));
		const out = filtered(r, h2, [cand("c1", "src/parse.ts", 12)]);
		expect(listed(out, "c1").map((item) => item.title)).toEqual([
			"Parse splits wrongly",
			TITLE,
		]);
	});

	test("reports every rejection of every entry whose code the candidate sits in", () => {
		const r = base();
		seed(
			r,
			r.h1,
			disproved(),
			disproved({
				title: "Inner claim",
				reason: "Inner reason.",
				line: 13,
				startLine: 12,
				endLine: 14,
			}),
		);
		expect(stored(r)).toHaveLength(2);
		const out = filtered(r, r.h1, [cand("c1", "src/parse.ts", 13)]);
		expect(
			listed(out, "c1")
				.map((item) => item.title)
				.sort(),
		).toEqual([TITLE, "Inner claim"].sort());
	});

	test("names each remembered rejection with a stable twelve character reference", () => {
		const r = base();
		seed(
			r,
			r.h1,
			disproved(),
			disproved({ title: "Parse splits wrongly", reason: "Once." }),
		);
		const first = filtered(r, r.h1, [cand("c1", "src/parse.ts", 12)]);
		const refs = listed(first, "c1").map((item) => item.ref);
		expect(refs).toHaveLength(2);
		for (const ref of refs) expect(ref).toMatch(/^[0-9a-f]{12}$/);
		expect(new Set(refs).size).toBe(2);
		const h2 = r.commit({ "README.md": "readme 2\n" });
		const later = filtered(r, h2, [cand("other", "src/parse.ts", 12)]);
		expect(listed(later, "other").map((item) => item.ref)).toEqual(refs);
	});
});

describe("a rejection rests on its guards", () => {
	test("a rejection whose guard was removed is no longer reported and carries no reason", () => {
		const r = base();
		seed(r, r.h1, disproved({ guards: [CALLER_GUARD] }), disprovedOther());
		const h2 = r.commit({ "src/caller.ts": CALLER_WITHOUT_CHECK });
		const run = filter(r, h2, {
			candidates: [
				cand("c1", "src/parse.ts", 12),
				cand("c2", "src/other.ts", 2),
			],
		});
		const out = JSON.parse(run.out) as FilterOutput;
		expect(result(out, "c1")).toMatchObject({
			status: "fresh",
			cause: "guard-changed",
		});
		expect(listed(out, "c1")).toEqual([]);
		expect(run.out).not.toContain(REASON);
		expect(result(out, "c2").status).toBe(PRIOR);
	});

	test("a guard that moved within its file is still present", () => {
		const r = base();
		seed(r, r.h1, disproved({ guards: [CALLER_GUARD] }));
		const h2 = r.commit({
			"src/caller.ts": `// added one\n// added two\n${CALLER_FILE}`,
		});
		expect(
			result(filtered(r, h2, [cand("c1", "src/parse.ts", 12)]), "c1").status,
		).toBe(PRIOR);
	});

	test("a guard that moved into another file counts as removed", () => {
		const r = base();
		seed(r, r.h1, disproved({ guards: [CALLER_GUARD] }));
		const h2 = r.commit({
			"src/caller.ts": CALLER_WITHOUT_CHECK,
			"src/guards.ts": `${CALLER_FILE.split("\n").slice(2, 5).join("\n")}\n`,
		});
		expect(
			result(filtered(r, h2, [cand("c1", "src/parse.ts", 12)]), "c1"),
		).toMatchObject({
			status: "fresh",
			cause: "guard-changed",
		});
	});

	test("only the rejection whose guard is gone drops out of the report", () => {
		const r = base();
		seed(
			r,
			r.h1,
			disproved({ guards: [CALLER_GUARD] }),
			disproved({ title: "Parse splits wrongly", reason: "Once." }),
		);
		const h2 = r.commit({ "src/caller.ts": CALLER_WITHOUT_CHECK });
		const out = filtered(r, h2, [cand("c1", "src/parse.ts", 12)]);
		expect(result(out, "c1").status).toBe(PRIOR);
		expect(listed(out, "c1").map((item) => item.title)).toEqual([
			"Parse splits wrongly",
		]);
	});
});

describe("judging a candidate afresh", () => {
	test("a changed line in the cited code makes it fresh and carries no reason", () => {
		const r = base();
		seed(r, r.h1, disproved());
		const h2 = r.commit({
			"src/parse.ts": PARSE_FILE.replace("first.trim()", "first.toUpperCase()"),
		});
		const run = filter(r, h2, { candidates: [cand("c1", "src/parse.ts", 12)] });
		const out = JSON.parse(run.out) as FilterOutput;
		expect(result(out, "c1")).toMatchObject({
			status: "fresh",
			cause: "cited-code-changed",
		});
		expect(run.out).not.toContain(REASON);
		expect(run.out).not.toContain(TITLE);
	});

	test("a removed line, a deleted file, or a renamed file makes it fresh", () => {
		const r = base();
		seed(r, r.h1, disproved());
		const outputs: FilterOutput[] = [];

		r.checkout(r.h1);
		const removed = r.commit({
			"src/parse.ts": PARSE_FILE.replace("\t// keep the first field\n", ""),
		});
		outputs.push(
			filtered(r, removed, [
				cand("old", "src/parse.ts", 12),
				cand("new", "src/parser.ts", 12),
			]),
		);

		r.checkout(r.h1);
		const deleted = r.commit({ "src/parse.ts": null });
		outputs.push(
			filtered(r, deleted, [
				cand("old", "src/parse.ts", 12),
				cand("new", "src/parser.ts", 12),
			]),
		);

		r.checkout(r.h1);
		const renamed = r.commit({
			"src/parse.ts": null,
			"src/parser.ts": PARSE_FILE,
		});
		outputs.push(
			filtered(r, renamed, [
				cand("old", "src/parse.ts", 12),
				cand("new", "src/parser.ts", 12),
			]),
		);

		for (const out of outputs) {
			expect(result(out, "old")).toMatchObject({
				status: "fresh",
				cause: "cited-code-changed",
			});
			expect(result(out, "new")).toMatchObject({
				status: "fresh",
				cause: "no-record",
			});
		}
	});

	test("a candidate with no cited line passes through as fresh and the other candidate is still judged", () => {
		const r = base();
		seed(r, r.h1, disproved());
		const run = filter(r, r.h1, {
			candidates: [cand("c1", "src/parse.ts"), cand("c2", "src/parse.ts", 12)],
		});
		expect(run.code).toBe(0);
		const out = JSON.parse(run.out) as FilterOutput;
		expect(result(out, "c1")).toMatchObject({
			status: "fresh",
			cause: "no-line",
		});
		expect(result(out, "c2").status).toBe(PRIOR);
	});

	test("an unsafe candidate path is fresh and is never handed to git", () => {
		const r = base();
		seed(r, r.h1, disproved());
		const logDir = scratchDir();
		const log = join(logDir, "git.log");
		const shim = join(logDir, "git");
		writeFileSync(
			shim,
			`#!/bin/sh\nprintf '%s\\n' "$*" >> '${log}'\nexec '${Bun.which("git")}' "$@"\n`,
		);
		chmodSync(shim, 0o755);
		const run = filter(
			r,
			r.h1,
			{
				candidates: [
					cand("c1", "../outside.ts", 1),
					cand("c2", "/etc/passwd", 1),
					cand("c3", "src/../../sneaky.ts", 1),
				],
			},
			IID,
			{ PATH: `${logDir}:${process.env.PATH}` },
		);
		expect(run.code).toBe(0);
		const out = JSON.parse(run.out) as FilterOutput;
		for (const id of ["c1", "c2", "c3"]) {
			expect(result(out, id)).toMatchObject({
				status: "fresh",
				cause: "no-record",
			});
		}
		const asked = readFileSync(log, "utf8");
		expect(asked).toContain(r.h1);
		for (const path of ["outside.ts", "passwd", "sneaky.ts"]) {
			expect(asked).not.toContain(path);
		}
	});
});

describe("memory belongs to one merge request", () => {
	test("a rejection on another merge request is not reported and its directory is not created", () => {
		const r = base();
		seed(r, r.h1, disproved());
		const out = filtered(r, r.h1, [cand("c1", "src/parse.ts", 12)], "841");
		expect(result(out, "c1")).toMatchObject({
			status: "fresh",
			cause: "no-record",
		});
		expect(existsSync(mrDir(r, "841"))).toBe(false);
	});

	test("a candidate that was never rejected is fresh and the memory is not modified", () => {
		const r = base();
		seed(r, r.h1, disproved());
		const before = memoryBytes(r);
		const out = filtered(r, r.h1, [
			cand("c1", "src/other.ts", 2),
			cand("c2", "src/caller.ts", 4),
			cand("c3", "README.md", 1),
		]);
		for (const id of ["c1", "c2", "c3"]) {
			expect(result(out, id)).toMatchObject({
				status: "fresh",
				cause: "no-record",
			});
		}
		expect(memoryBytes(r)).toBe(before);
	});

	test("with no memory file every candidate is fresh and nothing is created", () => {
		const r = base();
		const run = filter(r, r.h1, {
			candidates: [
				cand("c1", "src/parse.ts", 12),
				cand("c2", "src/other.ts", 2),
			],
		});
		expect(run.code).toBe(0);
		const out = JSON.parse(run.out) as FilterOutput;
		for (const id of ["c1", "c2"]) {
			expect(result(out, id)).toMatchObject({
				status: "fresh",
				cause: "no-record",
			});
		}
		expect(existsSync(join(r.root, ".review"))).toBe(false);
	});
});

describe("refusing memory that cannot be read", () => {
	const unusable = ["not json", '{"version":2,"entries":[]}'];
	for (const text of unusable) {
		test(`filter and record exit 1 on ${text}, say how to forget it, and leave it alone`, () => {
			const r = base();
			plantMemory(r, text);
			const runs = [
				filter(r, r.h1, { candidates: [cand("c1", "src/parse.ts", 12)] }),
				record(r, r.h1, { disproved: [disproved()] }),
			];
			for (const run of runs) {
				expect(run.code).toBe(1);
				expect(run.err).toContain("rejected.json");
				expect(run.err).toMatch(/delet/i);
				expect(run.err).toMatch(/forget/i);
				expect(memoryBytes(r)).toBe(text);
			}
		});
	}

	const entryOf = (m: Stored) => m.entries[0] as StoredEntry;
	const rejectionOf = (m: Stored) =>
		entryOf(m).rejections[0] as StoredRejection;
	const breakers: Array<[string, (memory: Stored) => void]> = [
		["an unknown key", (m) => void Object.assign(m, { extra: 1 })],
		["an empty code list", (m) => void entryOf(m).code.splice(0)],
		[
			"an entry with no rejections",
			(m) => void entryOf(m).rejections.splice(0),
		],
		[
			"a path leaving the repository",
			(m) => void Object.assign(entryOf(m), { path: "../x.ts" }),
		],
		[
			"an absolute path",
			(m) => void Object.assign(entryOf(m), { path: "/x.ts" }),
		],
		[
			"a leading dot slash",
			(m) => void Object.assign(entryOf(m), { path: "./src/parse.ts" }),
		],
		[
			"a dot dot part",
			(m) => void Object.assign(entryOf(m), { path: "src/../x.ts" }),
		],
		[
			"a title over 200 characters",
			(m) => void Object.assign(rejectionOf(m), { title: "t".repeat(201) }),
		],
		[
			"a reason over 600 characters",
			(m) => void Object.assign(rejectionOf(m), { reason: "r".repeat(601) }),
		],
		[
			"more than 3 guards",
			(m) =>
				void Object.assign(rejectionOf(m), {
					guards: Array.from({ length: 4 }, () => ({
						path: "src/a.ts",
						code: ["x"],
					})),
				}),
		],
		[
			"a guard with no code",
			(m) =>
				void Object.assign(rejectionOf(m), {
					guards: [{ path: "src/a.ts", code: [] }],
				}),
		],
		[
			"more than 5 rejections",
			(m) => {
				const one = rejectionOf(m);
				entryOf(m).rejections = Array.from({ length: 6 }, (_, n) => ({
					...one,
					title: `claim ${n}`,
				}));
			},
		],
	];
	for (const [name, breakIt] of breakers) {
		test(`a memory file with ${name} is refused with exit 1 and not rewritten`, () => {
			const r = base();
			seed(r, r.h1, disproved());
			const memory = JSON.parse(memoryBytes(r) as string) as Stored;
			breakIt(memory);
			const text = JSON.stringify(memory);
			plantMemory(r, text);
			const run = filter(r, r.h1, {
				candidates: [cand("c1", "src/parse.ts", 12)],
			});
			expect(run.code).toBe(1);
			expect(run.err).toContain("rejected.json");
			expect(memoryBytes(r)).toBe(text);
		});
	}
});

describe("refusing unusable arguments", () => {
	test("a merge request id that is not digits, or a head that is not a full SHA, exits 1 and writes nothing", () => {
		const r = base();
		const candidates = { candidates: [cand("c1", "src/parse.ts", 12)] };
		const runs = [
			filter(r, r.h1, candidates, "8x0"),
			filter(r, "abc123", candidates),
			record(r, r.h1, { disproved: [disproved()] }, "8x0"),
			record(r, "abc123", { disproved: [disproved()] }),
		];
		for (const run of runs) {
			expect(run.code).toBe(1);
			expect(run.err.trim().length).toBeGreaterThan(0);
		}
		expect(existsSync(join(r.root, ".review"))).toBe(false);
	});

	test("a head that is not a commit is an error and not a deleted file", () => {
		const r = base();
		seed(r, r.h1, disproved());
		const run = filter(r, "c".repeat(40), {
			candidates: [cand("c1", "src/parse.ts", 12)],
		});
		expect(run.code).toBe(1);
		expect(run.out.trim()).toBe("");
	});

	test("a directory that is not a repository exits 1", () => {
		const run = cli([
			"filter",
			scratchDir(),
			IID,
			"a".repeat(40),
			scratchFile("candidates.json", '{"candidates":[]}'),
		]);
		expect(run.code).toBe(1);
	});

	test("a missing argument exits 2 with the usage line each command exports", () => {
		const r = base();
		const filterRun = cli(["filter", r.root]);
		const recordRun = cli(["record", r.root]);
		expect(filterRun.code).toBe(2);
		expect(filterRun.err).toContain(
			`usage: ${REVIEW_MEMORY_FILTER_INVOCATION}`,
		);
		expect(recordRun.code).toBe(2);
		expect(recordRun.err).toContain(
			`usage: ${REVIEW_MEMORY_RECORD_INVOCATION}`,
		);
	});

	const badCandidates: Array<[string, unknown]> = [
		["not json", "not json"],
		[
			"a repeated id",
			{ candidates: [cand("c1", "a.ts", 1), cand("c1", "b.ts", 1)] },
		],
		["an empty id", { candidates: [cand("", "a.ts", 1)] }],
		["an empty path", { candidates: [{ id: "c1", path: "" }] }],
		["a missing path", { candidates: [{ id: "c1" }] }],
		["a line of zero", { candidates: [{ id: "c1", path: "a.ts", line: 0 }] }],
		[
			"a fractional line",
			{ candidates: [{ id: "c1", path: "a.ts", line: 1.5 }] },
		],
		[
			"an end line before the line",
			{ candidates: [{ id: "c1", path: "a.ts", line: 5, endLine: 4 }] },
		],
	];
	for (const [name, body] of badCandidates) {
		test(`a candidate list with ${name} exits 1 and writes nothing`, () => {
			const r = base();
			seed(r, r.h1, disproved());
			const before = memoryBytes(r);
			const run = filter(r, r.h1, body);
			expect(run.code).toBe(1);
			expect(memoryBytes(r)).toBe(before);
		});
	}
});

describe("keeping the report inside what the packet keeps", () => {
	test("the budget is derived from the packet's own limit", () => {
		expect(REJECTIONS_BUDGET_CHARS).toBe(EVIDENCE_TAIL_CHARS - 1000);
	});

	test("whole rejections only, within the budget, and the packet's tail still holds all of the section", () => {
		const r = base();
		const files: Files = {};
		for (const name of ["f1", "f2", "f3"])
			files[`src/${name}.ts`] = numbered(10);
		const h = r.commit(files);
		const items: object[] = [];
		const recordedTitles = new Set<string>();
		const recordedReasons = new Set<string>();
		for (const name of ["f1", "f2", "f3"]) {
			for (let n = 1; n <= 5; n++) {
				const title = `Claim ${name}-${n} `.padEnd(200, "x");
				const reason = `Reason ${name}-${n} `.padEnd(600, "y");
				recordedTitles.add(title);
				recordedReasons.add(reason);
				items.push({
					title,
					path: `src/${name}.ts`,
					line: 2,
					startLine: 1,
					endLine: 3,
					reason,
				});
			}
		}
		seed(r, h, ...items);
		const candidates = [
			cand("c1", "src/f1.ts", 2),
			cand("c2", "src/f2.ts", 2),
			cand("c3", "src/f3.ts", 2),
			...Array.from({ length: 150 }, (_, n) =>
				cand(`pad${n}`, `src/not-remembered-${n}.ts`, 1),
			),
		];
		const run = filter(r, h, { candidates });
		expect(run.code).toBe(0);
		const out = JSON.parse(run.out) as FilterOutput;
		expect(out.results.map((item) => item.id)).toEqual(
			candidates.map((item) => item.id),
		);

		const section = run.out.slice(run.out.lastIndexOf('"rejections"'));
		expect(section.length).toBeLessThanOrEqual(REJECTIONS_BUDGET_CHARS);
		expect(run.out.length).toBeGreaterThan(EVIDENCE_TAIL_CHARS);
		for (const group of out.rejections) {
			for (const item of group.items) {
				expect(recordedTitles.has(item.title)).toBe(true);
				expect(recordedReasons.has(item.reason)).toBe(true);
			}
		}

		expect(result(out, "c1").status).toBe(PRIOR);
		const first = out.rejections.find((item) => item.id === "c1");
		expect((first?.items.length ?? 0) + (first?.omitted ?? -1)).toBe(5);
		expect(result(out, "c3")).toMatchObject({
			status: "fresh",
			cause: "memory-over-budget",
		});
		expect(out.rejections.some((item) => item.id === "c3")).toBe(false);
		for (const group of out.rejections) {
			expect(result(out, group.id).status).toBe(PRIOR);
			expect(group.items.length + group.omitted).toBe(5);
		}

		const packet = buildReviewPacket({
			ticket: "ticket",
			spec: [],
			evidence: [{ title: "memory-filter.json", body: run.out }],
		});
		expect(packet).toContain("characters omitted");
		expect(packet).toContain(section);
	});
});

describe("naming a remembered rejection in the outcome", () => {
	function twoRejections() {
		const r = base();
		seed(
			r,
			r.h1,
			disproved(),
			disproved({ title: "Parse splits wrongly", reason: "It splits once." }),
		);
		const out = settle(r, r.h1, [cand("c1", "src/parse.ts", 12)]);
		return {
			r,
			out,
			first: refOf(out, "c1", TITLE),
			second: refOf(out, "c1", "Parse splits wrongly"),
		};
	}

	test("a dropped candidate is named without recording anything again", () => {
		const r = base();
		seed(r, r.h1, disproved());
		const h2 = r.commit({ "README.md": "readme 2\n" });
		const out = settle(r, h2, [cand("c1", "src/parse.ts", 12)]);
		const before = memoryBytes(r);
		const run = record(r, h2, {
			droppedAsPreviouslyDisproved: [
				{ id: "c1", rejection: refOf(out, "c1", TITLE) },
			],
		});
		expect(run.code).toBe(0);
		expect(memoryBytes(r)).toBe(before);
		const list = bulletFor(run);
		expect(
			list.split("\n").filter((line) => line.trim().length > 0),
		).toHaveLength(1);
		expect(JSON.parse(run.out)).toMatchObject({ recorded: 0, reversed: 0 });
	});

	test("the list is one bullet with the place, the title, the earlier reason, and the short head", () => {
		const r = base();
		seed(r, r.h1, disproved());
		const out = settle(r, r.h1, [cand("c1", "src/parse.ts", 12)]);
		const run = record(r, r.h1, {
			droppedAsPreviouslyDisproved: [
				{ id: "c1", rejection: refOf(out, "c1", TITLE) },
			],
		});
		expect(bulletFor(run)).toBe(
			`- \`src/parse.ts:12\` ${TITLE}. Earlier reason: ${REASON} (judged at ${r.h1.slice(0, 12)})`,
		);
	});

	test("the list shows the sanitiser's dash rule and cleans nothing else", () => {
		const r = base();
		seed(
			r,
			r.h1,
			disproved({
				title: "Parse – empty input",
				reason:
					"Empty input is rejected by the caller — parse is never reached.",
			}),
		);
		const out = settle(r, r.h1, [cand("c1", "src/parse.ts", 12)]);
		const run = record(r, r.h1, {
			droppedAsPreviouslyDisproved: [
				{ id: "c1", rejection: listed(out, "c1")[0]?.ref },
			],
		});
		const list = bulletFor(run);
		expect(list).toContain(
			"Empty input is rejected by the caller - parse is never reached.",
		);
		expect(list).toContain("Parse - empty input");
		expect(list).not.toMatch(/[—–]/);
	});

	test("a list is empty when nothing was dropped as previously disproved", () => {
		const r = base();
		const run = record(r, r.h1, { disproved: [disproved()] });
		expect(bulletFor(run)).toBe("");
	});

	test("a dropped or reversed item the filter did not mark is refused with exit 3 and names the candidate", () => {
		const r = base();
		seed(r, r.h1, disproved());
		const out = settle(r, r.h1, [
			cand("c1", "src/parse.ts", 12),
			cand("c2", "src/other.ts", 2),
		]);
		const real = refOf(out, "c1", TITLE);
		const before = memoryBytes(r);
		const refusedOutcomes: unknown[] = [
			{ droppedAsPreviouslyDisproved: [{ id: "c2", rejection: real }] },
			{ reversed: [{ id: "c2", rejection: real }] },
			{
				droppedAsPreviouslyDisproved: [{ id: "c1", rejection: "f".repeat(12) }],
			},
			{ reversed: [{ id: "c1", rejection: "f".repeat(12) }] },
			{ droppedAsPreviouslyDisproved: [{ id: "c9", rejection: real }] },
			{
				reversed: [{ id: "c1", rejection: real }],
				droppedAsPreviouslyDisproved: [{ id: "c1", rejection: real }],
			},
		];
		for (const outcome of refusedOutcomes) {
			const run = record(r, r.h1, outcome);
			expect(run.code).toBe(3);
			expect(said(run)).toMatch(/c[129]/);
			expect(memoryBytes(r)).toBe(before);
		}
	});

	test("a filter result that does not exist is unusable and exits 1", () => {
		const r = base();
		seed(r, r.h1, disproved());
		const before = memoryBytes(r);
		const run = record(r, r.h1, {
			droppedAsPreviouslyDisproved: [{ id: "c1", rejection: "a".repeat(12) }],
		});
		expect(run.code).toBe(1);
		expect(memoryBytes(r)).toBe(before);
	});

	test("a reversed rejection is removed and only that one, and the entry goes with the last", () => {
		const { r, first, second } = twoRejections();
		const run = record(r, r.h1, { reversed: [{ id: "c1", rejection: first }] });
		expect(run.code).toBe(0);
		expect(JSON.parse(run.out)).toMatchObject({ reversed: 1 });
		const remaining = stored(r);
		expect(remaining).toHaveLength(1);
		expect(remaining[0]?.rejections.map((item) => item.title)).toEqual([
			"Parse splits wrongly",
		]);

		expect(
			record(r, r.h1, { reversed: [{ id: "c1", rejection: second }] }).code,
		).toBe(0);
		expect(stored(r)).toEqual([]);
	});

	test("reversing a rejection that is already gone changes nothing", () => {
		const { r, first } = twoRejections();
		expect(
			record(r, r.h1, { reversed: [{ id: "c1", rejection: first }] }).code,
		).toBe(0);
		const before = memoryBytes(r);
		const again = record(r, r.h1, {
			reversed: [{ id: "c1", rejection: first }],
		});
		expect(again.code).toBe(0);
		expect(memoryBytes(r)).toBe(before);
	});

	test("an outcome in the shape a subagent returns stores, reverses, and lists in one run", () => {
		const r = base();
		seed(
			r,
			r.h1,
			disproved(),
			disproved({ title: "Parse splits wrongly", reason: "It splits once." }),
			disprovedOther(),
		);
		const out = settle(r, r.h1, [
			cand("c1", "src/parse.ts", 12),
			cand("c2", "src/other.ts", 2),
		]);
		const run = record(r, r.h1, {
			disproved: [
				disproved({
					title: "Big file claim",
					path: "src/big.ts",
					line: 3,
					startLine: 1,
					endLine: 5,
					reason: "It is bounded.",
				}),
			],
			reversed: [{ id: "c1", rejection: refOf(out, "c1", TITLE) }],
			droppedAsPreviouslyDisproved: [
				{ id: "c2", rejection: refOf(out, "c2", "Other doubles twice") },
			],
		});
		expect(run.code).toBe(0);
		expect(JSON.parse(run.out)).toMatchObject({ recorded: 1, reversed: 1 });
		expect(bulletFor(run)).toContain("`src/other.ts:2`");
		const titles = stored(r).flatMap((entry) =>
			entry.rejections.map((item) => item.title),
		);
		expect(titles.sort()).toEqual(
			["Big file claim", "Other doubles twice", "Parse splits wrongly"].sort(),
		);
	});
});

describe("a review that lists dropped candidates", () => {
	test("keeps the verdict the next review's scope reads", () => {
		const r = base();
		const iid = "7";
		const dir = join(r.root, ".review", `mr-${iid}`, r.h1);
		mkdirSync(dir, { recursive: true });
		const maxPath = join(dir, "max.md");
		writeFileSync(
			maxPath,
			[
				"## Code review max",
				"",
				`**Head:** \`${r.h1}\``,
				"**Verdict:** PASS",
				"",
				"### Findings",
				"",
				"No findings.",
				"",
				"### Previously disproved",
				"",
				`- \`src/parse.ts:12\` ${TITLE}. Earlier reason: ${REASON} (judged at ${r.h1.slice(0, 12)})`,
				"",
				"### Verification",
				"",
				"- nothing else",
				"",
				`<!-- code-review-max:mr=${iid} head=${r.h1} -->`,
				"",
			].join("\n"),
		);
		expect(readVerdict(maxPath, iid, r.h1)).toBe("PASS");
	});
});
