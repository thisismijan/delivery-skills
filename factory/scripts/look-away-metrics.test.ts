import { describe, expect, setDefaultTimeout, test } from "bun:test";
import { readFileSync } from "node:fs";
import {
	mkdir,
	mkdtemp,
	readFile,
	readdir,
	rm,
	stat,
	writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	LOOK_AWAY_INVOCATION,
	idleWorkers,
	longestStretch,
	peakConcurrency,
	runLimit,
	stopsByStage,
} from "./look-away-metrics";

setDefaultTimeout(60_000);

const SCRIPT = join(import.meta.dir, "look-away-metrics.ts");
const RUN_ID = "run-1";

function fixture(name: string): string {
	return readFileSync(join(import.meta.dir, "fixtures", name), "utf8");
}

const SAMPLE_LEDGER = fixture("look-away-ledger.md");
const SAMPLE_DISPATCH = fixture("look-away-dispatch.json");
const SAMPLE_JOURNAL = fixture("look-away-journal.md");
const OLDER_LEDGER = fixture("ledger-date-only.md");
const REAL_STOPS = fixture("ledger-real-stops.md");

const BASE = Date.UTC(2026, 10, 10, 9, 0, 0);

function secsLater(seconds: number): string {
	return new Date(BASE + seconds * 1000).toISOString().replace(".000Z", "Z");
}

const NINE = secsLater(0);
const HOUR = 3600;

function stop(time: string, key = "DS-1", stage = "execute"): string {
	return `- ${time} ${key} ${stage} — stopped for the operator — /delivery ${stage} ${key}`;
}

function approval(time: string): string {
	return `- ${time} DS-1 — approved the plan — operator — "yes"`;
}

function levelLine(limit: number | string): string {
	return `- 2026-11-09T13:34:05Z run - level standard: maxParallelWorktrees=${limit} maxFixAttempts=2 maxReviewRounds=3 - config.ts`;
}

const IDLE_LINE =
	"- 2026-11-10T11:00:00Z run - worker DS-2 idle for 25 minutes; stopped";

interface Parts {
	decisions?: string[];
	approvals?: string[];
	stops?: string[];
	lessons?: string[];
}

function ledger(parts: Parts = {}): string {
	const block = (heading: string, lines: string[] = []) =>
		`## ${heading}\n\n${lines.join("\n")}\n`;
	return [
		"# Run",
		"",
		"Ids: DS-1",
		"Generation: 1",
		"",
		block("Decisions", parts.decisions),
		block("Approvals", parts.approvals),
		block("Stops", parts.stops),
		block("Lessons", parts.lessons),
	].join("\n");
}

function worker(key: string, from: string, to?: string) {
	return {
		key,
		dispatchedAt: `2026-11-10T${from}:00Z`,
		...(to ? { finishedAt: `2026-11-10T${to}:00Z` } : {}),
	};
}

function dispatchOf(...workers: ReturnType<typeof worker>[]) {
	return { workers };
}

function overlapping(count: number, unfinished = false) {
	return dispatchOf(
		...Array.from({ length: count }, (_, index) =>
			worker(
				`DS-${index + 1}`,
				"10:00",
				unfinished && index === count - 1 ? undefined : "12:00",
			),
		),
	);
}

describe("LOOK_AWAY_INVOCATION", () => {
	test("is the script path and its two arguments, written as one double-quoted literal", () => {
		expect(LOOK_AWAY_INVOCATION).toBe(
			"scripts/look-away-metrics.ts <state-root> <run-id>",
		);
		expect(readFileSync(SCRIPT, "utf8")).toMatch(
			/export const LOOK_AWAY_INVOCATION =\s*"scripts\/look-away-metrics\.ts <state-root> <run-id>"/,
		);
	});
});

describe("peakConcurrency", () => {
	test("overlapping workers give the largest overlap", () => {
		const peak = peakConcurrency(
			dispatchOf(
				worker("DS-1", "10:00", "12:00"),
				worker("DS-2", "11:00", "13:00"),
				worker("DS-3", "11:30", "11:45"),
			),
		);
		expect(peak).toMatchObject({ state: "exact", workers: 3 });
	});

	test("back-to-back workers do not overlap", () => {
		const peak = peakConcurrency(
			dispatchOf(
				worker("DS-1", "10:00", "11:00"),
				worker("DS-2", "11:00", "12:00"),
			),
		);
		expect(peak).toMatchObject({ state: "exact", workers: 1 });
	});

	test("a worker with no finish time makes the peak at least", () => {
		const peak = peakConcurrency(
			dispatchOf(worker("DS-1", "10:00"), worker("DS-2", "11:00", "12:00")),
		);
		expect(peak).toMatchObject({ state: "at-least", workers: 2 });
	});

	test("a single unfinished worker is at least one", () => {
		expect(peakConcurrency(dispatchOf(worker("DS-1", "10:00")))).toMatchObject({
			state: "at-least",
			workers: 1,
		});
	});

	test("several waves in one record file are one run", () => {
		const peak = peakConcurrency(
			dispatchOf(
				worker("DS-1", "09:00", "11:00"),
				worker("DS-2", "09:30", "12:00"),
				worker("DS-3", "13:00", "14:00"),
				worker("DS-4", "13:10", "14:10"),
				worker("DS-5", "13:20", "14:20"),
			),
		);
		expect(peak).toMatchObject({ state: "exact", workers: 3 });
	});

	test("a worker that finishes the instant it was dispatched still counts as one", () => {
		expect(
			peakConcurrency(dispatchOf(worker("DS-1", "10:00", "10:00"))),
		).toMatchObject({ state: "exact", workers: 1 });
		expect(
			peakConcurrency(
				dispatchOf(
					worker("DS-1", "10:00", "10:00"),
					worker("DS-2", "10:00", "12:00"),
				),
			),
		).toMatchObject({ state: "exact", workers: 1 });
	});

	test("a missing record is unknown, with a reason that the records were not found", () => {
		const peak = peakConcurrency(undefined);
		expect(peak).toMatchObject({ state: "unknown" });
		expect(peak).not.toHaveProperty("workers");
		expect(JSON.stringify(peak)).toMatch(/not found/i);
	});

	const UNUSABLE: [string, unknown][] = [
		["an empty worker list", { workers: [] }],
		["a record with no workers", {}],
		["a worker with a malformed key", dispatchOf(worker("bad key", "10:00"))],
		["something that is not an object", "workers"],
		[
			"a worker that finishes before it was dispatched",
			dispatchOf(worker("DS-1", "12:00", "11:00")),
		],
	];
	for (const [name, dispatch] of UNUSABLE) {
		test(`${name} is unknown with a plain reason`, () => {
			const peak = peakConcurrency(dispatch);
			expect(peak).toMatchObject({ state: "unknown" });
			expect(peak).not.toHaveProperty("workers");
			expect(JSON.stringify(peak)).toMatch(/"reason":"[^"]{5,}"/);
		});
	}

	test("a key dispatched again is unknown, with a reason that a key appears twice", () => {
		const peak = peakConcurrency(
			dispatchOf(
				worker("DS-2", "10:00", "11:00"),
				worker("DS-2", "12:00", "13:00"),
			),
		);
		expect(peak).toMatchObject({ state: "unknown" });
		expect(peak).not.toHaveProperty("workers");
		expect(JSON.stringify(peak)).toMatch(/twice/i);
	});
});

describe("stopsByStage", () => {
	test("counts stops by stage across timed and date-only lines", () => {
		const result = stopsByStage([
			ledger({
				stops: [
					"- 2026-11-02 DS-1 execute — red gate passed unexpectedly — /delivery execute DS-1",
					"- 2026-11-09T13:40:12Z DS-2 draft — cannot commit — /delivery draft DS-2",
					"- 2026-11-10T09:00:00Z DS-3 execute — needs a decision — /delivery execute DS-3",
					"- 2026-11-10T15:00:00Z DS-3 review — blocker found — /delivery review DS-3",
				],
			}),
		]);
		expect(result.total).toBe(4);
		expect(result.byStage).toEqual({ execute: 2, draft: 1, review: 1 });
		expect(result.unreadable).toEqual([]);
	});

	test("reads the lines of a real ledger: a plain hyphen after the stage, the key run, and a blank line", () => {
		const result = stopsByStage([REAL_STOPS]);
		expect(result.total).toBe(3);
		expect(result.byStage).toEqual({ groom: 1, auto: 1, draft: 1 });
		expect(result.unreadable).toEqual([]);
	});

	test("groups stages without regard to letter case", () => {
		const result = stopsByStage([
			ledger({
				stops: [
					stop(secsLater(0), "DS-1", "Execute"),
					stop(secsLater(60), "DS-2", "EXECUTE"),
					stop(secsLater(120), "DS-3", "execute"),
				],
			}),
		]);
		expect(result.byStage).toEqual({ execute: 3 });
	});

	test("surfaces a line that cannot be read, in full, and counts it at no stage", () => {
		const unreadable = [
			"- 2026-11-10T09:00:00Z waiting on the vendor",
			"continuous-delivery: yes",
			"* 2026-11-10 DS-4 execute — stopped",
		];
		const result = stopsByStage([
			ledger({
				stops: [
					"- 2026-11-10T08:00:00Z DS-4 execute — stopped — /delivery execute DS-4",
					...unreadable,
				],
			}),
		]);
		expect(result.total).toBe(4);
		expect(result.byStage).toEqual({ execute: 1 });
		expect(result.unreadable).toEqual(unreadable);
		expect(
			Object.values(result.byStage).reduce((sum, count) => sum + count, 0) +
				result.unreadable.length,
		).toBe(result.total);
	});

	test("counts only the Stops section, in every heading of it, whatever its case, trailing space or line endings", () => {
		const text = [
			"# Run",
			"",
			"## Decisions",
			"",
			"- 2026-11-10T09:00:00Z DS-1 decision — kept the plan",
			"",
			"## Approvals",
			"",
			'- 2026-11-10T09:00:00Z DS-1 — approved execute — operator — "yes"',
			"",
			"## stops ",
			"",
			stop(secsLater(0), "DS-1", "execute"),
			"",
			"## Lessons",
			"",
			"- 2026-11-10 execute — 1 — a lesson that names a stage — accepted",
			"",
			"## Stops",
			"",
			stop(secsLater(60), "DS-2", "review"),
			"",
		].join("\r\n");
		const result = stopsByStage([text]);
		expect(result.total).toBe(2);
		expect(result.byStage).toEqual({ execute: 1, review: 1 });
	});

	test("counts the stops of the ledger and of every journal together", () => {
		const result = stopsByStage([
			ledger({ stops: [stop(secsLater(0), "DS-1", "execute")] }),
			ledger({
				stops: [
					stop(secsLater(60), "DS-2", "execute"),
					stop(secsLater(120), "DS-2", "review"),
				],
			}),
		]);
		expect(result.total).toBe(3);
		expect(result.byStage).toEqual({ execute: 2, review: 1 });
	});

	test("does not count approvals", () => {
		const result = stopsByStage([
			ledger({
				approvals: [approval(secsLater(0))],
				stops: [stop(secsLater(60))],
			}),
		]);
		expect(result.total).toBe(1);
	});

	test("reports none for an empty Stops section and for no Stops section", () => {
		for (const text of [
			ledger(),
			"# Run\n\nGeneration: 1\n\n## Decisions\n\n- 2026-11-10 run — a decision\n",
		]) {
			const result = stopsByStage([text]);
			expect(result.total).toBe(0);
			expect(result.byStage).toEqual({});
			expect(result.unreadable).toEqual([]);
		}
	});
});

describe("idleWorkers", () => {
	test("names a worker the coordinator stopped for being idle, read from Decisions", () => {
		expect(idleWorkers(ledger({ decisions: [IDLE_LINE] }))).toEqual(["DS-2"]);
	});

	test("reads nothing from other sections and nothing when no worker was stopped", () => {
		expect(idleWorkers(ledger())).toEqual([]);
		expect(
			idleWorkers(
				ledger({
					lessons: [
						"- 2026-11-10 run — worker DS-2 idle for 25 minutes; stopped",
					],
				}),
			),
		).toEqual([]);
	});

	test("is not counted as a stop", () => {
		const text = ledger({
			decisions: [IDLE_LINE],
			stops: [stop(secsLater(0)), stop(secsLater(60))],
		});
		expect(stopsByStage([text]).total).toBe(2);
	});
});

describe("runLimit", () => {
	test("reads the limit the run used from the level line in Decisions", () => {
		expect(runLimit(ledger({ decisions: [levelLine(8)] }))).toMatchObject({
			state: "known",
			value: 8,
		});
	});

	test("is unknown with no level line, and ignores a value that is not a positive whole number", () => {
		for (const decisions of [
			[],
			[levelLine(0)],
			[levelLine("many")],
			[levelLine("-2")],
			[levelLine("2.5")],
		]) {
			const limit = runLimit(ledger({ decisions }));
			expect(limit).toMatchObject({ state: "unknown" });
			expect(limit).not.toHaveProperty("value");
		}
	});

	test("uses the highest of several usable lines and skips an unusable one", () => {
		expect(
			runLimit(
				ledger({
					decisions: [levelLine(4), levelLine("many"), levelLine(8)],
				}),
			),
		).toMatchObject({ state: "known", value: 8 });
	});

	test("reads only the Decisions section", () => {
		expect(
			runLimit(ledger({ lessons: [levelLine(8)], stops: [levelLine(8)] })),
		).toMatchObject({ state: "unknown" });
	});
});

describe("longestStretch", () => {
	test("reports the longest gap between consecutive timed interrupts, in hours and minutes", () => {
		const stretch = longestStretch([
			ledger({
				stops: [stop(secsLater(0)), stop(secsLater(6 * HOUR + 45 * 60))],
				approvals: [
					approval(secsLater(90 * 60)),
					approval(secsLater(7 * HOUR)),
				],
			}),
		]);
		expect(stretch).toMatchObject({
			state: "known",
			seconds: 5 * HOUR + 15 * 60,
			text: "5h 15m",
			from: secsLater(90 * 60),
			to: secsLater(6 * HOUR + 45 * 60),
		});
	});

	test("orders stops and approvals by time across sections", () => {
		const stretch = longestStretch([
			ledger({
				approvals: [approval(secsLater(3 * HOUR))],
				stops: [stop(secsLater(0)), stop(secsLater(6 * HOUR))],
			}),
		]);
		expect(stretch).toMatchObject({
			state: "known",
			seconds: 3 * HOUR,
			text: "3h 0m",
		});
	});

	test("counts a stop in a worker journal as splitting a gap the ledger alone would show", () => {
		const main = ledger({
			stops: [stop(secsLater(0)), stop(secsLater(8 * HOUR))],
		});
		const journal = ledger({ stops: [stop(secsLater(4 * HOUR), "DS-2")] });
		expect(longestStretch([main])).toMatchObject({ text: "8h 0m" });
		expect(longestStretch([main, journal])).toMatchObject({
			state: "known",
			seconds: 4 * HOUR,
			text: "4h 0m",
		});
	});

	test("says the stretch includes waiting, and a Decisions line does not split it", () => {
		const stretch = longestStretch([
			ledger({
				decisions: [`- ${secsLater(4 * HOUR)} run - operator chose option A`],
				stops: [stop(secsLater(0)), stop(secsLater(9 * HOUR))],
			}),
		]);
		expect(stretch).toMatchObject({
			state: "known",
			seconds: 9 * HOUR,
			text: "9h 0m",
			includesWaiting: true,
		});
	});

	test("does not use the coordinator's idle-worker stop as an interrupt", () => {
		const stretch = longestStretch([
			ledger({
				decisions: [
					`- ${secsLater(4 * HOUR)} run - worker DS-2 idle for 25 minutes; stopped`,
				],
				stops: [stop(secsLater(0)), stop(secsLater(8 * HOUR))],
			}),
		]);
		expect(stretch).toMatchObject({ seconds: 8 * HOUR, text: "8h 0m" });
	});

	test("is unknown with fewer than two timed interrupts", () => {
		for (const text of [
			ledger(),
			ledger({ stops: [stop(NINE)] }),
			ledger({ stops: [stop(NINE)], approvals: [] }),
		]) {
			const stretch = longestStretch([text]);
			expect(stretch).toMatchObject({ state: "unknown" });
			expect(stretch).not.toHaveProperty("seconds");
			expect(JSON.stringify(stretch)).toMatch(/two timed/i);
		}
	});

	test("never estimates a stretch from a date-only ledger, even with one timed line added", () => {
		const unknown = longestStretch([OLDER_LEDGER]);
		expect(unknown).toMatchObject({ state: "unknown" });
		const withOne = OLDER_LEDGER.replace(
			"## Stops\n",
			`## Stops\n\n${stop("2026-11-09T13:34:05Z")}`,
		);
		expect(withOne).not.toBe(OLDER_LEDGER);
		expect(longestStretch([withOne])).toMatchObject({ state: "unknown" });
	});

	test("hides a gap that a date-only line dated inside it could have split", () => {
		const stretch = longestStretch([
			ledger({
				stops: [
					"- 2026-11-09 DS-1 execute — an older stop — /delivery execute DS-1",
					stop("2026-11-09T09:00:00Z"),
					stop("2026-11-10T18:00:00Z"),
					stop("2026-11-10T20:00:00Z"),
				],
			}),
		]);
		expect(stretch).toMatchObject({
			state: "known",
			seconds: 2 * HOUR,
			text: "2h 0m",
		});
	});

	test("a date-only line outside every gap hides nothing", () => {
		const stretch = longestStretch([
			ledger({
				stops: [
					"- 2026-11-02 DS-1 execute — an older stop — /delivery execute DS-1",
					stop(secsLater(0)),
					stop(secsLater(8 * HOUR)),
				],
			}),
		]);
		expect(stretch).toMatchObject({
			state: "known",
			seconds: 8 * HOUR,
			text: "8h 0m",
		});
	});

	test("a date-only line dated on the day a gap ends at midnight does not hide that gap, and one dated the day before does", () => {
		const timed = [stop("2026-11-09T20:00:00Z"), stop("2026-11-10T00:00:00Z")];
		const nextDay = longestStretch([
			ledger({
				stops: [
					...timed,
					"- 2026-11-10 DS-1 execute — an older stop — /delivery execute DS-1",
				],
			}),
		]);
		expect(nextDay).toMatchObject({ state: "known", text: "4h 0m" });
		const sameDay = longestStretch([
			ledger({
				stops: [
					...timed,
					"- 2026-11-09 DS-1 execute — an older stop — /delivery execute DS-1",
				],
			}),
		]);
		expect(sameDay).toMatchObject({ state: "unknown" });
	});

	test("is unknown when an untimed line could have fallen in every gap", () => {
		const untimed: Parts[] = [
			{
				approvals: ['- 2026-11-10 DS-1 — approved the plan — operator — "yes"'],
			},
			{ stops: ["- sometime DS-1 execute — stopped — /delivery execute DS-1"] },
			{ approvals: ["continuous-delivery: yes"] },
		];
		for (const extra of untimed) {
			const stretch = longestStretch([
				ledger({
					stops: [
						stop(secsLater(0)),
						stop(secsLater(8 * HOUR)),
						...(extra.stops ?? []),
					],
					approvals: extra.approvals,
				}),
			]);
			expect([extra, stretch]).toEqual([
				extra,
				expect.objectContaining({ state: "unknown" }),
			]);
			expect(JSON.stringify(stretch)).toMatch(/no time/i);
		}
	});

	test("applies the untimed-line rule to a worker journal as to the ledger", () => {
		const main = ledger({
			stops: [stop(secsLater(0)), stop(secsLater(8 * HOUR))],
		});
		const journal = ledger({
			stops: [
				"- 2026-11-10 DS-2 execute — an older stop — /delivery execute DS-2",
			],
		});
		expect(longestStretch([main, journal])).toMatchObject({ state: "unknown" });
	});

	test("rounds the display down and keeps the exact length", () => {
		expect(
			longestStretch([
				ledger({ stops: [stop(secsLater(0)), stop(secsLater(4 * HOUR - 1))] }),
			]),
		).toMatchObject({ seconds: 14399, text: "3h 59m" });
		expect(
			longestStretch([
				ledger({ stops: [stop(secsLater(0)), stop(secsLater(4 * HOUR))] }),
			]),
		).toMatchObject({ seconds: 14400, text: "4h 0m" });
	});

	test("takes only a time the ledger writer accepts as timed", () => {
		const lines = [
			stop("2026-11-10T09:00:00Z"),
			"- 2026-11-10T10:00:00Zabc DS-1 execute — stopped",
			"- 2026-11-10T11:00:00.000Z DS-1 execute — stopped",
			"- 2026-13-45T25:00:00Z DS-1 execute — stopped",
			"* 2026-11-10T12:00:00Z DS-1 execute — stopped",
		];
		const stretch = longestStretch([ledger({ stops: lines })]);
		expect(stretch).toMatchObject({ state: "unknown" });
		expect(stretch).not.toHaveProperty("seconds");
	});
});

describe("the look-away command", () => {
	interface Inputs {
		ledger: string;
		dispatch?: unknown;
		rawDispatch?: string;
		journals?: Record<string, string>;
		journalDirectories?: string[];
		env?: Record<string, string>;
	}

	interface Report {
		peak: { state: string; workers?: number; reason?: string };
		stops: {
			total: number;
			byStage: Record<string, number>;
			unreadable: string[];
		};
		journals: { read: number; unreadable: string[] };
		idleWorkers: string[];
		longestStretch: {
			state: string;
			seconds?: number;
			text?: string;
			from?: string;
			to?: string;
			includesWaiting?: boolean;
			reason?: string;
		};
		suggestion: {
			action: string;
			runLimit: { state: string; value?: number };
			configuredLimit: number;
			reasons: string[];
		};
	}

	async function withRoot(run: (root: string) => Promise<void>): Promise<void> {
		const root = await mkdtemp(join(tmpdir(), "look-away-"));
		try {
			await run(root);
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	}

	function stateRoot(root: string): string {
		return join(root, "state");
	}

	function environment(extra: Record<string, string> = {}) {
		const env: Record<string, string> = {};
		for (const [name, value] of Object.entries(process.env)) {
			if (value === undefined) continue;
			if (["DELIVERY_LEVEL", "MAX_PARALLEL_WORKTREES"].includes(name)) continue;
			env[name] = value;
		}
		return { ...env, ...extra };
	}

	async function seed(root: string, inputs: Inputs): Promise<void> {
		const state = stateRoot(root);
		await mkdir(state, { recursive: true });
		await writeFile(join(state, `${RUN_ID}.md`), inputs.ledger);
		const workers = join(state, "workers", RUN_ID);
		const hasWorkers =
			inputs.dispatch !== undefined ||
			inputs.rawDispatch !== undefined ||
			inputs.journals !== undefined ||
			inputs.journalDirectories !== undefined;
		if (!hasWorkers) return;
		await mkdir(workers, { recursive: true });
		if (inputs.rawDispatch !== undefined) {
			await writeFile(join(workers, "dispatch.json"), inputs.rawDispatch);
		} else if (inputs.dispatch !== undefined) {
			await writeFile(
				join(workers, "dispatch.json"),
				JSON.stringify(inputs.dispatch),
			);
		}
		for (const [name, text] of Object.entries(inputs.journals ?? {})) {
			await writeFile(join(workers, name), text);
		}
		for (const name of inputs.journalDirectories ?? []) {
			await mkdir(join(workers, name), { recursive: true });
		}
	}

	async function runScript(
		args: string[],
		env: Record<string, string> = {},
	): Promise<{ exitCode: number; stdout: string; stderr: string }> {
		const proc = Bun.spawn(["bun", SCRIPT, ...args], {
			env: environment(env),
			stdout: "pipe",
			stderr: "pipe",
		});
		const [stdout, stderr, exitCode] = await Promise.all([
			new Response(proc.stdout).text(),
			new Response(proc.stderr).text(),
			proc.exited,
		]);
		return { exitCode, stdout, stderr };
	}

	async function runOn(root: string, inputs: Inputs) {
		await seed(root, inputs);
		return runScript([stateRoot(root), RUN_ID], inputs.env);
	}

	async function reportFor(inputs: Inputs): Promise<Report> {
		let report: Report | undefined;
		await withRoot(async (root) => {
			const result = await runOn(root, inputs);
			expect(result.stderr).toBe("");
			expect(result.exitCode).toBe(0);
			report = JSON.parse(result.stdout) as Report;
		});
		if (!report) throw new Error("no report");
		return report;
	}

	interface Raising {
		runLimit?: number | null;
		configured?: number;
		peak?: number;
		unfinished?: boolean;
		gap?: number;
		idle?: boolean;
	}

	function raising(over: Raising = {}): Inputs {
		const runLimitValue = over.runLimit === undefined ? 4 : over.runLimit;
		return {
			ledger: ledger({
				decisions: [
					...(runLimitValue === null ? [] : [levelLine(runLimitValue)]),
					...(over.idle ? [IDLE_LINE] : []),
				],
				stops: [stop(secsLater(0))],
				approvals: [approval(secsLater(over.gap ?? 5 * HOUR))],
			}),
			dispatch: overlapping(over.peak ?? 4, over.unfinished),
			env: { MAX_PARALLEL_WORKTREES: String(over.configured ?? 4) },
		};
	}

	function reasonsOf(report: Report): string {
		return report.suggestion.reasons.join("\n");
	}

	async function snapshot(dir: string): Promise<Record<string, string>> {
		const found: Record<string, string> = {};
		async function walk(path: string, name: string): Promise<void> {
			const info = await stat(path);
			if (info.isDirectory()) {
				found[`${name}/`] = "directory";
				for (const entry of (await readdir(path)).sort()) {
					await walk(join(path, entry), `${name}/${entry}`);
				}
			} else {
				found[name] = await readFile(path, "utf8");
			}
		}
		await walk(dir, "");
		return found;
	}

	describe("the whole report", () => {
		async function sampleReport(
			dispatch = SAMPLE_DISPATCH,
		): Promise<{ stdout: string; report: Report }> {
			let out = "";
			await withRoot(async (root) => {
				const result = await runOn(root, {
					ledger: SAMPLE_LEDGER,
					rawDispatch: dispatch,
					journals: { "DS-2.md": SAMPLE_JOURNAL },
					env: { MAX_PARALLEL_WORKTREES: "4" },
				});
				expect(result.stderr).toBe("");
				expect(result.exitCode).toBe(0);
				out = result.stdout;
			});
			return { stdout: out, report: JSON.parse(out) as Report };
		}

		test("reports the peak, the stops by stage, the stretch and the suggestion for a fan-out run", async () => {
			const { report } = await sampleReport();
			expect(report.peak).toMatchObject({ state: "at-least", workers: 3 });
			expect(report.stops.total).toBe(6);
			expect(report.stops.byStage).toEqual({ draft: 1, execute: 3, review: 2 });
			expect(report.stops.unreadable).toEqual([]);
			expect(report.journals).toEqual({ read: 1, unreadable: [] });
			expect(report.idleWorkers).toEqual(["DS-2"]);
			expect(report.longestStretch).toMatchObject({
				state: "known",
				seconds: 69588,
				text: "19h 19m",
				from: "2026-11-09T13:40:12Z",
				to: "2026-11-10T09:00:00Z",
				includesWaiting: true,
			});
			expect(report.suggestion).toMatchObject({
				action: "hold",
				runLimit: { state: "known", value: 4 },
				configuredLimit: 4,
			});
		});

		test("prints two-space indented JSON, with stage keys in sorted order", async () => {
			const { stdout, report } = await sampleReport();
			expect(stdout.trim()).toBe(JSON.stringify(report, null, 2));
			expect(Object.keys(report.stops.byStage)).toEqual([
				"draft",
				"execute",
				"review",
			]);
		});

		test("gives the same bytes every time, whatever the clock the dispatch records sit on", async () => {
			const first = await sampleReport();
			const second = await sampleReport();
			expect(second.stdout).toBe(first.stdout);
			const future = await sampleReport(
				SAMPLE_DISPATCH.replaceAll("2026-11-10", "2126-11-10"),
			);
			const past = await sampleReport(
				SAMPLE_DISPATCH.replaceAll("2026-11-10", "1926-11-10"),
			);
			expect(future.stdout).toBe(first.stdout);
			expect(past.stdout).toBe(first.stdout);
		});
	});

	describe("a run with no journals folder", () => {
		test("reports from the ledger alone, with the peak unknown and no journal unreadable", async () => {
			const report = await reportFor({
				ledger: ledger({
					stops: [
						stop(NINE, "DS-1", "execute"),
						stop(secsLater(5 * HOUR), "DS-1", "review"),
					],
				}),
			});
			expect(report.peak.state).toBe("unknown");
			expect(report.peak.reason).toMatch(/not found/i);
			expect(report.stops.total).toBe(2);
			expect(report.stops.byStage).toEqual({ execute: 1, review: 1 });
			expect(report.journals).toEqual({ read: 0, unreadable: [] });
			expect(report.longestStretch).toMatchObject({
				state: "known",
				text: "5h 0m",
			});
			expect(report.suggestion.action).toBe("hold");
		});
	});

	describe("dispatch records", () => {
		const stoppedLedger = ledger({
			stops: [
				stop(NINE, "DS-1", "execute"),
				stop(secsLater(2 * HOUR), "DS-1", "review"),
			],
		});
		const CASES: [string, Partial<Inputs>, RegExp][] = [
			["invalid JSON", { rawDispatch: "{ not json" }, /./],
			[
				"a record that fails the schema",
				{ dispatch: { workers: [{ key: "bad" }] } },
				/./,
			],
			[
				"a worker that finishes before it was dispatched",
				{ dispatch: dispatchOf(worker("DS-1", "12:00", "11:00")) },
				/./,
			],
			[
				"a key dispatched twice",
				{
					dispatch: dispatchOf(
						worker("DS-2", "10:00", "11:00"),
						worker("DS-2", "12:00", "13:00"),
					),
				},
				/twice/i,
			],
		];
		for (const [name, inputs, reason] of CASES) {
			test(`${name} makes the peak unknown and leaves the other parts as usual`, async () => {
				const report = await reportFor({ ledger: stoppedLedger, ...inputs });
				expect(report.peak.state).toBe("unknown");
				expect(report.peak.reason).toMatch(reason);
				expect(report.peak.reason?.length).toBeGreaterThan(5);
				expect(report.stops.total).toBe(2);
				expect(report.longestStretch).toMatchObject({ text: "2h 0m" });
				expect(report.suggestion.action).toBe("hold");
			});
		}
	});

	describe("journals", () => {
		test("counts stops that live only in a worker journal", async () => {
			const report = await reportFor({
				ledger: ledger({ stops: [stop(NINE, "DS-1", "execute")] }),
				dispatch: overlapping(1),
				journals: {
					"DS-2.md": ledger({
						stops: [
							stop(secsLater(HOUR), "DS-2", "execute"),
							stop(secsLater(2 * HOUR), "DS-2", "review"),
						],
					}),
				},
			});
			expect(report.stops.total).toBe(3);
			expect(report.stops.byStage).toEqual({ execute: 2, review: 1 });
			expect(report.journals).toEqual({ read: 1, unreadable: [] });
		});

		test("splits a gap with a journal's stop", async () => {
			const report = await reportFor({
				ledger: ledger({ stops: [stop(NINE), stop(secsLater(8 * HOUR))] }),
				journals: {
					"DS-2.md": ledger({ stops: [stop(secsLater(4 * HOUR), "DS-2")] }),
				},
			});
			expect(report.longestStretch).toMatchObject({
				text: "4h 0m",
				seconds: 14400,
			});
		});

		test("does not read the dispatch record as a journal", async () => {
			const report = await reportFor({
				ledger: ledger({ stops: [stop(NINE)] }),
				dispatch: overlapping(1),
			});
			expect(report.journals).toEqual({ read: 0, unreadable: [] });
		});

		test("names a journal that cannot be read, makes the stretch unknown, and holds", async () => {
			const report = await reportFor({
				...raising(),
				journalDirectories: ["DS-3.md"],
			});
			expect(report.journals.unreadable).toEqual(["DS-3.md"]);
			expect(report.longestStretch.state).toBe("unknown");
			expect(report.longestStretch.reason).toMatch(/journal/i);
			expect(report.suggestion.action).toBe("hold");
			expect(reasonsOf(report)).toMatch(/journal/i);
			expect(JSON.stringify(report)).toMatch(/incomplete/i);
		});
	});

	describe("the suggestion", () => {
		test("is raise when the peak reached the limit and the stretch is four hours", async () => {
			const report = await reportFor(raising({ gap: 4 * HOUR }));
			expect(report.longestStretch.seconds).toBe(14400);
			expect(report.suggestion).toMatchObject({
				action: "raise",
				runLimit: { state: "known", value: 4 },
				configuredLimit: 4,
			});
			expect(reasonsOf(report)).toMatch(/peak/i);
			expect(reasonsOf(report)).toMatch(/four hours/i);
			expect(reasonsOf(report)).toMatch(/waiting/i);
		});

		test("holds when the peak is below the limit", async () => {
			const report = await reportFor(raising({ peak: 3, gap: 10 * HOUR }));
			expect(report.suggestion.action).toBe("hold");
			expect(reasonsOf(report)).toMatch(/did not reach/i);
		});

		test("holds when the stretch is one second short of four hours", async () => {
			const report = await reportFor(raising({ gap: 4 * HOUR - 1 }));
			expect(report.longestStretch).toMatchObject({
				seconds: 14399,
				text: "3h 59m",
			});
			expect(report.suggestion.action).toBe("hold");
			expect(reasonsOf(report)).toMatch(/stretch/i);
		});

		test("holds when the stretch is unknown", async () => {
			const inputs = raising();
			const report = await reportFor({
				...inputs,
				ledger: ledger({
					decisions: [levelLine(4)],
					stops: [stop(secsLater(0))],
				}),
			});
			expect(report.longestStretch.state).toBe("unknown");
			expect(report.suggestion.action).toBe("hold");
			expect(reasonsOf(report)).toMatch(/stretch/i);
		});

		test("holds when the peak is unknown", async () => {
			const report = await reportFor({
				...raising({ gap: 9 * HOUR }),
				dispatch: undefined,
			});
			expect(report.peak.state).toBe("unknown");
			expect(report.suggestion.action).toBe("hold");
			expect(reasonsOf(report)).toMatch(/peak is unknown/i);
		});

		for (const peak of [4, 6]) {
			test(`never raises on a peak of at least ${peak}`, async () => {
				const report = await reportFor(
					raising({ peak, unfinished: true, gap: 5 * HOUR }),
				);
				expect(report.peak).toMatchObject({ state: "at-least", workers: peak });
				expect(report.suggestion.action).toBe("hold");
				expect(reasonsOf(report)).toMatch(/finish/i);
			});
		}

		test("counts an exact peak above the run limit as reached", async () => {
			const report = await reportFor(raising({ peak: 6, gap: 5 * HOUR }));
			expect(report.peak).toMatchObject({ state: "exact", workers: 6 });
			expect(report.suggestion.action).toBe("raise");
		});

		test("reads the limit the run used from the ledger, not from the shell", async () => {
			const report = await reportFor({
				...raising({ runLimit: 8, peak: 4, gap: 6 * HOUR }),
				env: {},
			});
			expect(report.suggestion).toMatchObject({
				action: "hold",
				runLimit: { state: "known", value: 8 },
				configuredLimit: 4,
			});
			expect(reasonsOf(report)).toMatch(/did not reach/i);
		});

		test("takes an override recorded for the run as the limit it used", async () => {
			const report = await reportFor(
				raising({ runLimit: 2, configured: 2, peak: 2, gap: 5 * HOUR }),
			);
			expect(report.suggestion).toMatchObject({
				action: "raise",
				runLimit: { state: "known", value: 2 },
				configuredLimit: 2,
			});
		});

		test("holds, naming both limits, when the limit changed since the run", async () => {
			const report = await reportFor(
				raising({ runLimit: 4, configured: 8, peak: 4, gap: 5 * HOUR }),
			);
			expect(report.suggestion).toMatchObject({
				action: "hold",
				runLimit: { state: "known", value: 4 },
				configuredLimit: 8,
			});
			expect(reasonsOf(report)).toMatch(/differ/i);
			expect(reasonsOf(report)).toContain("4");
			expect(reasonsOf(report)).toContain("8");
		});

		test("holds when no limit was recorded, and still shows the configured limit", async () => {
			const report = await reportFor(
				raising({ runLimit: null, peak: 4, gap: 5 * HOUR }),
			);
			expect(report.suggestion.runLimit).toEqual({ state: "unknown" });
			expect(report.suggestion.configuredLimit).toBe(4);
			expect(report.suggestion.action).toBe("hold");
			expect(reasonsOf(report)).toMatch(/unknown/i);
		});

		for (const value of ["0", "many"]) {
			test(`treats a recorded limit of ${value} as no limit`, async () => {
				const inputs = raising({ peak: 4, gap: 5 * HOUR });
				const report = await reportFor({
					...inputs,
					ledger: ledger({
						decisions: [levelLine(value)],
						stops: [stop(secsLater(0))],
						approvals: [approval(secsLater(5 * HOUR))],
					}),
				});
				expect(report.suggestion.runLimit).toEqual({ state: "unknown" });
				expect(report.suggestion.action).toBe("hold");
			});
		}

		test("uses the highest of several recorded limits", async () => {
			const inputs = raising({ peak: 4, gap: 5 * HOUR });
			const report = await reportFor({
				...inputs,
				ledger: ledger({
					decisions: [levelLine(4), levelLine(8)],
					stops: [stop(secsLater(0))],
					approvals: [approval(secsLater(5 * HOUR))],
				}),
			});
			expect(report.suggestion.runLimit).toEqual({ state: "known", value: 8 });
			expect(report.suggestion.action).toBe("hold");
		});

		test("holds when a worker was stopped for being idle, and names it", async () => {
			const report = await reportFor(raising({ idle: true, gap: 5 * HOUR }));
			expect(report.idleWorkers).toEqual(["DS-2"]);
			expect(report.suggestion.action).toBe("hold");
			expect(reasonsOf(report)).toMatch(/idle/i);
		});

		test("explains itself in plain words, with no field names", async () => {
			for (const over of [{ gap: 5 * HOUR }, { peak: 2, gap: 5 * HOUR }]) {
				const report = await reportFor(raising(over));
				expect(report.suggestion.reasons.length).toBeGreaterThan(0);
				expect(reasonsOf(report)).not.toMatch(
					/maxParallelWorktrees|finishedAt|dispatchedAt|journalsComplete|byStage|undefined|null/,
				);
			}
		});
	});

	describe("failures", () => {
		test("a missing ledger is a plain failure naming the ledger", async () => {
			await withRoot(async (root) => {
				await mkdir(stateRoot(root), { recursive: true });
				const result = await runScript([stateRoot(root), RUN_ID]);
				expect(result.exitCode).toBe(1);
				expect(result.stdout).toBe("");
				expect(result.stderr).toContain(`${RUN_ID}.md`);
			});
		});

		test("an invalid configuration is a plain failure naming the setting", async () => {
			await withRoot(async (root) => {
				const result = await runOn(root, {
					...raising(),
					env: { MAX_PARALLEL_WORKTREES: "0" },
				});
				expect(result.exitCode).toBe(1);
				expect(result.stdout).toBe("");
				expect(result.stderr).toMatch(
					/MAX_PARALLEL_WORKTREES|maxParallelWorktrees/,
				);
			});
		});

		for (const args of [[], ["only-one-argument"]]) {
			test(`${args.length} argument(s) is a usage mistake that names the command`, async () => {
				const result = await runScript(args);
				expect(result.exitCode).toBe(2);
				expect(result.stdout).toBe("");
				expect(result.stderr).toContain(LOOK_AWAY_INVOCATION);
			});
		}
	});

	describe("writes nothing and changes no setting", () => {
		for (const [name, inputs] of [
			["raise", raising({ gap: 5 * HOUR })],
			["hold", raising({ peak: 2, gap: 5 * HOUR })],
		] as const) {
			test(`leaves every file under the state root and the settings file as they were when it suggests ${name}`, async () => {
				await withRoot(async (root) => {
					await seed(root, inputs);
					const settings = join(root, "settings.env");
					await writeFile(settings, "MAX_PARALLEL_WORKTREES=4\n");
					const before = await snapshot(root);
					const result = await runScript([stateRoot(root), RUN_ID], inputs.env);
					expect(result.exitCode).toBe(0);
					const parsed = JSON.parse(result.stdout) as Report;
					expect(parsed.suggestion.action).toBe(name);
					expect(await snapshot(root)).toEqual(before);
					expect(await readFile(settings, "utf8")).toBe(
						"MAX_PARALLEL_WORKTREES=4\n",
					);
				});
			});
		}

		test("the script's source imports only functions that read", () => {
			const source = readFileSync(SCRIPT, "utf8");
			const imported = [
				...source.matchAll(
					/import\s*\{([^}]*)\}\s*from\s*"node:fs(?:\/promises)?"/g,
				),
			].flatMap((match) =>
				(match[1] ?? "")
					.split(",")
					.map((name) => name.trim().split(/\s+as\s+/)[0] ?? "")
					.filter(Boolean),
			);
			const reading = /^(?:read|exists|stat|lstat|access|opendir)/i;
			expect(imported.filter((name) => !reading.test(name))).toEqual([]);
			expect(source).not.toMatch(
				/\b(?:writeFile|appendFile|mkdir|mkdtemp|rmdir|rename|unlink|copyFile|symlink|truncate|chmod|rm)(?:Sync)?\s*\(/,
			);
			expect(source).not.toMatch(/Bun\.write|Bun\.spawn|child_process/);
		});
	});
});
