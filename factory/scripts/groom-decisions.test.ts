import { describe, expect, setDefaultTimeout, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	CHALLENGE_LABELS,
	CHALLENGE_MARKER,
	GROOM_DECISIONS_CHECK_INVOCATION,
	checkChallenges,
} from "./groom-decisions";

setDefaultTimeout(20_000);

const SCRIPT = join(import.meta.dir, "groom-decisions.ts");

const ordinary = (question: string) =>
	[
		`Question: ${question}`,
		"Options: A) keep the queue, B) replace the queue",
		"Pick: B",
		"Withheld recommendation: A",
		"Differed: yes",
	].join("\n");

type Entry = {
	pick?: string;
	question?: string;
	evidence?: string;
	decision?: string;
	final?: string;
};

const challengeLines = (entry: Entry = {}) => [
	`Challenged pick: ${entry.pick ?? "replace the queue"}`,
	`Challenge question: ${entry.question ?? "Should the queue be replaced?"}`,
	`Evidence: ${entry.evidence ?? '"the queue module owns retry scheduling"'}`,
	`Operator decision: ${entry.decision ?? "kept"}`,
	`Final pick: ${entry.final ?? entry.pick ?? "replace the queue"}`,
];

const REPORT = [
	"## Session 1",
	"Modules: the queue module owns retry scheduling.",
	'Domain terms: a job is "pending" until a worker claims it.',
	"## Session 2",
	"Seams: the   scheduler\treads    the clock once per tick.",
].join("\n");

const logWith = (...blocks: string[][]) =>
	["## Grilling", ...blocks.flat()].join("\n");

const entryBlock = (entry: Entry = {}) => [
	ordinary(entry.question ?? "Should the queue be replaced?"),
	...challengeLines(entry),
];

describe("challenge marker and labels", () => {
	test("export the exact wording the log is parsed by", () => {
		expect(CHALLENGE_MARKER).toBe("Challenged pick:");
		expect([...CHALLENGE_LABELS]).toEqual([
			"Challenge question:",
			"Evidence:",
			"Operator decision:",
			"Final pick:",
		]);
	});

	test("the check invocation names the script and both files", () => {
		expect(GROOM_DECISIONS_CHECK_INVOCATION).toContain(
			'scripts/groom-decisions.ts" check "<output-dir>/decisions.md" "<output-dir>/explorer-report.md"',
		);
	});
});

describe("a log that carries no challenge entry", () => {
	test("passes with zero entries when only ordinary entries are present", () => {
		const log = [
			"## Grilling",
			ordinary("Who is the operator?"),
			"Agent decided: single ticket, the input names one outcome",
			ordinary("Which queue?"),
			"",
			"Agent decided: keep the retry module",
		].join("\n");
		const result = checkChallenges(log, REPORT);
		expect(result.ok).toBe(true);
		expect(result.problems).toEqual([]);
		expect(result.entries).toBe(0);
	});

	test("passes without a report when nothing was challenged", () => {
		const result = checkChallenges(logWith([ordinary("Which queue?")]), "");
		expect(result.ok).toBe(true);
		expect(result.entries).toBe(0);
	});
});

describe("a complete entry in a log shaped like a real decisions.md", () => {
	const log = [
		"## Grilling",
		ordinary("Who is the operator?"),
		"Agent decided: the input names the delivery operator",
		ordinary("Should the queue be replaced?"),
		...challengeLines({
			question: "Should the queue be replaced?",
			evidence: '"the queue module owns retry scheduling"',
			decision: "kept",
		}),
		"Agent decided: scope stays on the queue module",
		ordinary("Is a job pending?"),
		...challengeLines({
			pick: "a job is ready at once",
			question: "Is a job pending?",
			evidence: '"a job is "pending" until a worker claims it"',
			decision: "changed",
			final: "a job waits until claimed",
		}),
		"## Addendum",
		ordinary("How often does the scheduler read the clock?"),
		...challengeLines({
			pick: "on every call",
			question: "How often does the scheduler read the clock?",
			evidence: '"the scheduler reads the clock once per tick"',
			decision: "kept",
		}),
		"",
		ordinary("Which seam?"),
		...challengeLines({
			pick: "a new clock seam",
			question: "Which seam?",
			evidence: '"the queue module owns retry scheduling"',
			decision: "changed",
			final: "reuse the scheduler",
		}),
	].join("\n");

	test("is accepted and counts every entry", () => {
		const result = checkChallenges(log, REPORT);
		expect(result.problems).toEqual([]);
		expect(result.ok).toBe(true);
		expect(result.entries).toBe(4);
	});

	test("accepts a passage with inner double quotes and one whose spacing differs only in repeated whitespace", () => {
		const result = checkChallenges(
			logWith([
				ordinary("Is a job pending?"),
				...challengeLines({
					question: "Is a job pending?",
					evidence: '"a job is "pending" until a worker claims it"',
				}),
			]),
			REPORT,
		);
		expect(result.ok).toBe(true);
		const spaced = checkChallenges(
			logWith([
				ordinary("How often?"),
				...challengeLines({
					question: "How often?",
					evidence: '"the scheduler reads the clock once per tick"',
				}),
			]),
			REPORT,
		);
		expect(spaced.ok).toBe(true);
	});

	test("accepts a passage that the report wraps across lines", () => {
		const wrapped = "## Session 1\nthe queue module\nowns   retry\nscheduling";
		const result = checkChallenges(logWith(entryBlock()), wrapped);
		expect(result.ok).toBe(true);
	});

	test("accepts a passage from an earlier session after a later session was appended", () => {
		const result = checkChallenges(
			logWith(
				entryBlock({
					evidence: '"a job is "pending" until a worker claims it"',
					question: "Is a job pending?",
				}),
			),
			REPORT,
		);
		expect(result.ok).toBe(true);
	});

	test("does not read the ordinary Question lines as challenge questions", () => {
		const result = checkChallenges(
			logWith(
				[ordinary("Should the queue be replaced?")],
				[ordinary("Should the queue be replaced?")],
				entryBlock(),
			),
			REPORT,
		);
		expect(result.ok).toBe(true);
		expect(result.entries).toBe(1);
	});
});

describe("a malformed entry", () => {
	const missing = (label: string) =>
		challengeLines().filter((line) => !line.startsWith(label));

	const cases: Array<{ name: string; lines: string[]; names: RegExp }> = [
		{
			name: "no Challenge question line",
			lines: missing("Challenge question:"),
			names: /Challenge question/i,
		},
		{
			name: "no Evidence line",
			lines: missing("Evidence:"),
			names: /Evidence/i,
		},
		{
			name: "no Operator decision line",
			lines: missing("Operator decision:"),
			names: /Operator decision/i,
		},
		{
			name: "no Final pick line",
			lines: missing("Final pick:"),
			names: /Final pick/i,
		},
		{
			name: "an empty Challenged pick value",
			lines: ["Challenged pick:", ...challengeLines().slice(1)],
			names: /Challenged pick/i,
		},
		{
			name: "an empty Challenge question value",
			lines: challengeLines().map((line) =>
				line.startsWith("Challenge question:") ? "Challenge question:" : line,
			),
			names: /Challenge question/i,
		},
		{
			name: "an empty Final pick value",
			lines: challengeLines().map((line) =>
				line.startsWith("Final pick:") ? "Final pick:" : line,
			),
			names: /Final pick/i,
		},
		{
			name: "an empty Operator decision value",
			lines: challengeLines({ decision: "" }),
			names: /Operator decision/i,
		},
		{
			name: "reordered Evidence and Challenge question lines",
			lines: (() => {
				const [a, b, c, d, e] = challengeLines();
				return [a, c, b, d, e] as string[];
			})(),
			names: /Challenge question|Evidence/i,
		},
		{
			name: "a duplicated Evidence line",
			lines: (() => {
				const [a, b, c, d, e] = challengeLines();
				return [a, b, c, c, d, e] as string[];
			})(),
			names: /Operator decision|Evidence/i,
		},
		{
			name: "a blank line inside the entry",
			lines: (() => {
				const [a, b, c, d, e] = challengeLines();
				return [a, b, "", c, d, e] as string[];
			})(),
			names: /Challenge question|Evidence|consecutive/i,
		},
		{
			name: "an Evidence value without double quotes",
			lines: challengeLines({
				evidence: "the queue module owns retry scheduling",
			}),
			names: /Evidence/i,
		},
		{
			name: "an Evidence value with only one double quote",
			lines: challengeLines({
				evidence: '"the queue module owns retry scheduling',
			}),
			names: /Evidence/i,
		},
		{
			name: "an Evidence value with an empty passage",
			lines: challengeLines({ evidence: '""' }),
			names: /Evidence/i,
		},
		{
			name: "an Evidence passage that continues on the next line",
			lines: (() => {
				const [a, b, , d, e] = challengeLines();
				return [
					a,
					b,
					'Evidence: "the queue module owns',
					'retry scheduling"',
					d,
					e,
				] as string[];
			})(),
			names: /Evidence|Operator decision/i,
		},
		{
			name: "an unknown Operator decision value",
			lines: challengeLines({ decision: "maybe" }),
			names: /Operator decision/i,
		},
		{
			name: "a kept decision whose final pick differs",
			lines: challengeLines({ decision: "kept", final: "keep the queue" }),
			names: /kept|Final pick/i,
		},
		{
			name: "a changed decision whose final pick is the same",
			lines: challengeLines({
				decision: "changed",
				pick: "replace the queue",
				final: "replace the queue",
			}),
			names: /changed|Final pick/i,
		},
	];

	for (const { name, lines, names } of cases) {
		test(`is refused with ${name}`, () => {
			const log = ["## Grilling", ordinary("Q?"), ...lines].join("\n");
			const result = checkChallenges(log, REPORT);
			expect(result.ok).toBe(false);
			expect(result.problems.length).toBeGreaterThan(0);
			expect(result.problems.join("\n")).toMatch(names);
		});
	}

	test("is refused when the entry stops short and a blank line follows the marker line", () => {
		const log = [
			"## Grilling",
			ordinary("Q?"),
			"Challenged pick: replace the queue",
			"",
			"Agent decided: moved on",
		].join("\n");
		const result = checkChallenges(log, REPORT);
		expect(result.ok).toBe(false);
		expect(result.problems.join("\n")).toMatch(/Challenged pick/i);
	});

	test("is refused when an Agent decided line follows a bare marker line", () => {
		const log = [
			"## Grilling",
			ordinary("Q?"),
			"Challenged pick: replace the queue",
			"Challenge question: Should the queue be replaced?",
			"Agent decided: moved on",
		].join("\n");
		expect(checkChallenges(log, REPORT).ok).toBe(false);
	});
});

describe("a decorated or lookalike marker", () => {
	const decorated = [
		"**Challenged pick:** replace the queue",
		"- Challenged pick: replace the queue",
		"* Challenged pick: replace the queue",
		"Challenged Pick: replace the queue",
		"CHALLENGED PICK: replace the queue",
		"  Challenged pick: replace the queue",
		"\tChallenged pick: replace the queue",
		"> Challenged pick: replace the queue",
		"## Challenged pick: replace the queue",
		"`Challenged pick:` replace the queue",
		"**Challenged pick: replace the queue**",
		"- **Challenged pick:** replace the queue",
	];

	for (const marker of decorated) {
		test(`refuses ${JSON.stringify(marker)} even when four correct lines follow`, () => {
			const log = [
				"## Grilling",
				ordinary("Q?"),
				marker,
				...challengeLines().slice(1),
			].join("\n");
			const result = checkChallenges(log, REPORT);
			expect(result.ok).toBe(false);
			expect(result.problems.join("\n")).toMatch(/challenged pick/i);
		});
	}

	test("refuses a decorated marker standing alone", () => {
		const log = [
			"## Grilling",
			ordinary("Q?"),
			"**Challenged pick:** replace the queue",
		].join("\n");
		expect(checkChallenges(log, REPORT).ok).toBe(false);
	});

	test("refuses a decorated marker after a well-formed entry", () => {
		const log = [
			...logWith(entryBlock()).split("\n"),
			ordinary("Second?"),
			"- Challenged pick: replace the queue",
			...challengeLines({ question: "Second?" }).slice(1),
		].join("\n");
		expect(checkChallenges(log, REPORT).ok).toBe(false);
	});

	test("refuses a bolded label line inside an otherwise well-formed entry", () => {
		const lines = challengeLines();
		lines[2] = `**Evidence:** ${lines[2]?.slice("Evidence: ".length)}`;
		const log = ["## Grilling", ordinary("Q?"), ...lines].join("\n");
		expect(checkChallenges(log, REPORT).ok).toBe(false);
	});
});

describe("evidence must exist in the report", () => {
	test("refuses a passage that is not in the report and names the challenge question", () => {
		const result = checkChallenges(
			logWith(
				entryBlock({
					question: "Should the cache be dropped?",
					evidence: '"the cache module owns invalidation"',
				}),
			),
			REPORT,
		);
		expect(result.ok).toBe(false);
		expect(result.problems.join("\n")).toContain(
			"Should the cache be dropped?",
		);
	});

	test("refuses a passage whose case differs from the report", () => {
		const result = checkChallenges(
			logWith(
				entryBlock({ evidence: '"The Queue Module owns retry scheduling"' }),
			),
			REPORT,
		);
		expect(result.ok).toBe(false);
	});

	test("refuses a passage whose wording differs from the report", () => {
		const result = checkChallenges(
			logWith(
				entryBlock({ evidence: '"the queue module handles retry scheduling"' }),
			),
			REPORT,
		);
		expect(result.ok).toBe(false);
	});

	for (const [name, report] of [
		["an empty report", ""],
		["a whitespace-only report", " \n\t\n"],
	] as const) {
		test(`refuses every entry against ${name} and names its question`, () => {
			const result = checkChallenges(
				logWith(
					entryBlock({ question: "First question?" }),
					entryBlock({ question: "Second question?" }),
				),
				report,
			);
			expect(result.ok).toBe(false);
			const text = result.problems.join("\n");
			expect(text).toContain("First question?");
			expect(text).toContain("Second question?");
		});
	}
});

describe("a challenge question is asked once per section", () => {
	test("refuses the same challenge question twice under one heading and names it", () => {
		const result = checkChallenges(
			logWith(
				entryBlock({ question: "Should the queue be replaced?" }),
				entryBlock({ question: "Should the queue be replaced?" }),
			),
			REPORT,
		);
		expect(result.ok).toBe(false);
		expect(result.problems.join("\n")).toContain(
			"Should the queue be replaced?",
		);
	});

	test("accepts the same challenge question under two different headings", () => {
		const log = [
			"## Grilling",
			...entryBlock({ question: "Should the queue be replaced?" }),
			"## Addendum",
			...entryBlock({ question: "Should the queue be replaced?" }),
		].join("\n");
		const result = checkChallenges(log, REPORT);
		expect(result.problems).toEqual([]);
		expect(result.ok).toBe(true);
		expect(result.entries).toBe(2);
	});

	test("accepts different challenge questions under one heading", () => {
		const result = checkChallenges(
			logWith(
				entryBlock({ question: "First question?" }),
				entryBlock({ question: "Second question?" }),
			),
			REPORT,
		);
		expect(result.ok).toBe(true);
	});
});

describe("check mode", () => {
	const run = async (
		decisions: string | null,
		report: string | null,
		extra?: { args?: string[] },
	) => {
		const dir = await mkdtemp(join(tmpdir(), "groom-decisions-"));
		try {
			const decisionsPath = join(dir, "decisions.md");
			const reportPath = join(dir, "explorer-report.md");
			if (decisions !== null) await writeFile(decisionsPath, decisions);
			if (report !== null) await writeFile(reportPath, report);
			const proc = Bun.spawnSync(
				[
					process.execPath,
					"run",
					SCRIPT,
					...(extra?.args ?? ["check", decisionsPath, reportPath]),
				],
				{ stdout: "pipe", stderr: "pipe" },
			);
			return {
				code: proc.exitCode,
				stdout: proc.stdout.toString(),
				stderr: proc.stderr.toString(),
			};
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	};

	test("exits 0 and prints the result as JSON for a log that passes", async () => {
		const result = await run(logWith(entryBlock()), REPORT);
		expect(result.code).toBe(0);
		const parsed = JSON.parse(result.stdout) as {
			ok: boolean;
			problems: string[];
			entries: number;
		};
		expect(parsed.ok).toBe(true);
		expect(parsed.problems).toEqual([]);
		expect(parsed.entries).toBe(1);
	});

	test("exits 1 and prints the problems for a malformed entry", async () => {
		const result = await run(
			logWith(entryBlock({ decision: "maybe" })),
			REPORT,
		);
		expect(result.code).toBe(1);
		const parsed = JSON.parse(result.stdout) as {
			ok: boolean;
			problems: string[];
		};
		expect(parsed.ok).toBe(false);
		expect(parsed.problems.length).toBeGreaterThan(0);
	});

	test("exits 1 for a decorated marker", async () => {
		const log = [
			"## Grilling",
			ordinary("Q?"),
			"**Challenged pick:** replace the queue",
			...challengeLines().slice(1),
		].join("\n");
		expect((await run(log, REPORT)).code).toBe(1);
	});

	test("exits 1 for a passage that is not in the report", async () => {
		const result = await run(
			logWith(entryBlock({ evidence: '"nothing like this was reported"' })),
			REPORT,
		);
		expect(result.code).toBe(1);
	});

	test("exits 1 and says the decision log could not be read when decisions.md is missing", async () => {
		const result = await run(null, REPORT);
		expect(result.code).toBe(1);
		const parsed = JSON.parse(result.stdout) as {
			ok: boolean;
			problems: string[];
		};
		expect(parsed.ok).toBe(false);
		expect(parsed.problems.join("\n")).toMatch(/could not be read/i);
	});

	test("exits 0 when the report file is missing and the log has no challenges", async () => {
		const result = await run(logWith([ordinary("Which queue?")]), null);
		expect(result.code).toBe(0);
		expect((JSON.parse(result.stdout) as { ok: boolean }).ok).toBe(true);
	});

	test("exits 1 when the report file is missing and the log has a challenge", async () => {
		const result = await run(logWith(entryBlock()), null);
		expect(result.code).toBe(1);
	});

	test("exits 2 when no arguments follow check", async () => {
		const result = await run(null, null, { args: ["check"] });
		expect(result.code).toBe(2);
	});

	test("exits 2 when the report path is missing", async () => {
		const result = await run(null, null, {
			args: ["check", "/tmp/groom-decisions-only-one-arg.md"],
		});
		expect(result.code).toBe(2);
	});
});
