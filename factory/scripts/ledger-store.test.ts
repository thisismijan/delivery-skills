import { describe, expect, setDefaultTimeout, test } from "bun:test";
import { readFileSync } from "node:fs";
import {
	mkdir,
	mkdtemp,
	readFile,
	rm,
	stat,
	writeFile,
} from "node:fs/promises";
import { hostname, tmpdir } from "node:os";
import { join } from "node:path";
import {
	CONCURRENCY_CONFLICT_EXIT_CODE,
	ConcurrencyConflict,
	LEDGER_TIME_FORMAT,
	isLedgerTime,
	ledgerEntryLines,
	ledgerEntryProblems,
	ledgerGeneration,
	ledgerLineTime,
	ledgerTarget,
	nextLedger,
	recoverLock,
	writeLedger,
} from "./ledger-store";
import { NEEDS_VALIDATION_ACK_PHRASE } from "./needs-validation";

setDefaultTimeout(60_000);

async function withRoot(run: (root: string) => Promise<void>): Promise<void> {
	const root = await mkdtemp(join(tmpdir(), "ledger-store-"));
	try {
		await run(root);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
}

function markdown(generation: number, extra = ""): string {
	return `# Run\n\nGeneration: ${generation}\n${extra}`;
}

function lockDir(root: string, id: string): string {
	return join(root, `${id}.md.lock`);
}

async function plantOwner(
	root: string,
	id: string,
	owner: { pid: number; host: string; timestamp?: string } | "unreadable",
): Promise<void> {
	const dir = lockDir(root, id);
	await mkdir(dir);
	if (owner === "unreadable") {
		await writeFile(join(dir, "owner.json"), "not-json");
		return;
	}
	await writeFile(
		join(dir, "owner.json"),
		JSON.stringify({
			pid: owner.pid,
			host: owner.host,
			timestamp: owner.timestamp ?? "2026-01-01T00:00:00.000Z",
		}),
	);
}

async function lockPresent(root: string, id: string): Promise<boolean> {
	try {
		await stat(lockDir(root, id));
		return true;
	} catch {
		return false;
	}
}

test("ledger generation is incremented exactly once", () => {
	const current = "# Run\n\nGeneration: 2\n";
	expect(ledgerGeneration(nextLedger(current, 2))).toBe(3);
	expect(() => nextLedger(current, 1)).toThrow(ConcurrencyConflict);
	expect(() => nextLedger(current, 1)).toThrow("stale");
});

test("stale writers cannot overwrite a newer ledger", async () => {
	await withRoot(async (root) => {
		await writeLedger(root, "abc-1", -1, markdown(0));
		await writeLedger(root, "abc-1", 0, markdown(1, "\nfirst\n"));
		try {
			await writeLedger(root, "abc-1", 0, markdown(1, "\nstale\n"));
			throw new Error("stale write should not succeed");
		} catch (error) {
			expect(error).toBeInstanceOf(ConcurrencyConflict);
			expect((error as Error).message).toContain("stale");
		}
		expect(await readFile(join(root, "abc-1.md"), "utf8")).toContain("first");
	});
});

test("ledger ids cannot escape the state root", async () => {
	await withRoot(async (root) => {
		const input = join(root, "input.md");
		await writeFile(input, markdown(0));
		await expect(
			writeLedger(root, "../escape", -1, await readFile(input, "utf8")),
		).rejects.toThrow("invalid ledger id");
	});
});

test("worker journal path is authoritative and cannot mutate the run ledger", async () => {
	await withRoot(async (root) => {
		const runRoot = join(root, "runs");
		const journal = join(root, "workers", "run-1", "work-2.md");
		const input = join(root, "input.md");
		await writeLedger(runRoot, "run-1", -1, markdown(0, "\nshared\n"));
		await writeFile(input, markdown(0, "\nworker\n"));
		expect(ledgerTarget(runRoot, "run-1", journal)).toEqual({
			root: join(root, "workers", "run-1"),
			id: "work-2",
			workerJournal: true,
		});

		const script = join(import.meta.dir, "ledger-store.ts");
		const proc = Bun.spawn(["bun", script, runRoot, "run-1", "-1", input], {
			env: { ...process.env, DELIVERY_WORKER_JOURNAL: journal },
			stdout: "pipe",
			stderr: "pipe",
		});
		expect(await proc.exited).toBe(0);
		expect(await readFile(join(runRoot, "run-1.md"), "utf8")).toContain(
			"shared",
		);
		expect(await readFile(journal, "utf8")).toContain("worker");
	});
});

test("worker journal must be an absolute safe markdown path", () => {
	expect(() => ledgerTarget("/runs", "run-1", "../work.md")).toThrow(
		/absolute/,
	);
	expect(() => ledgerTarget("/runs", "run-1", "/workers/../bad?.md")).toThrow(
		/file-safe/,
	);
});

test("two writers on one generation keep only the winner and return a typed conflict", async () => {
	await withRoot(async (root) => {
		await writeLedger(root, "abc-1", -1, markdown(0));
		const results = await Promise.allSettled([
			writeLedger(root, "abc-1", 0, markdown(1, "\nwriter-a\n")),
			writeLedger(root, "abc-1", 0, markdown(1, "\nwriter-b\n")),
		]);
		const fulfilled = results.filter((r) => r.status === "fulfilled");
		const rejected = results.filter((r) => r.status === "rejected");
		expect(fulfilled).toHaveLength(1);
		expect(rejected).toHaveLength(1);
		expect(rejected[0]?.reason).toBeInstanceOf(ConcurrencyConflict);
		const stored = await readFile(join(root, "abc-1.md"), "utf8");
		expect(ledgerGeneration(stored)).toBe(1);
		const keptA = stored.includes("writer-a");
		const keptB = stored.includes("writer-b");
		expect(keptA || keptB).toBe(true);
		expect(keptA && keptB).toBe(false);
	});
});

test("a held lock gives a conflict and leaves the ledger unchanged", async () => {
	await withRoot(async (root) => {
		await writeLedger(root, "abc-1", -1, markdown(0, "\noriginal\n"));
		await mkdir(lockDir(root, "abc-1"));
		try {
			await writeLedger(root, "abc-1", 0, markdown(1, "\nchanged\n"));
			throw new Error("write should not succeed while the lock is held");
		} catch (error) {
			expect(error).toBeInstanceOf(ConcurrencyConflict);
		}
		expect(await readFile(join(root, "abc-1.md"), "utf8")).toContain(
			"original",
		);
		expect(
			ledgerGeneration(await readFile(join(root, "abc-1.md"), "utf8")),
		).toBe(0);
	});
});

test("a ledger with no Generation header is accepted as generation 0 and stamped", async () => {
	await withRoot(async (root) => {
		const legacy = "# Run\n\nIds: ABC-1\n\nlegacy body\n";
		await writeFile(join(root, "abc-1.md"), legacy);
		expect(ledgerGeneration(legacy)).toBe(0);
		const stamped = nextLedger(legacy, 0);
		expect(ledgerGeneration(stamped)).toBe(1);
		expect(stamped).toContain("legacy body");
		expect(stamped).toContain("Ids: ABC-1");
		await writeLedger(root, "abc-1", 0, stamped);
		const first = await readFile(join(root, "abc-1.md"), "utf8");
		expect(first).toContain("legacy body");
		expect(ledgerGeneration(first)).toBe(1);
		await writeLedger(root, "abc-1", 1, nextLedger(first, 1));
		const second = await readFile(join(root, "abc-1.md"), "utf8");
		expect(ledgerGeneration(second)).toBe(2);
		expect(second).toContain("legacy body");
	});
});

test("a current-format ledger needs no conversion on first durable use", async () => {
	await withRoot(async (root) => {
		await writeFile(join(root, "abc-1.md"), markdown(3, "\ncurrent body\n"));
		await writeLedger(root, "abc-1", 3, markdown(4, "\ncurrent body\n"));
		const stored = await readFile(join(root, "abc-1.md"), "utf8");
		expect(ledgerGeneration(stored)).toBe(4);
		expect(stored).toContain("current body");
	});
});

test("recovery clears a dead owner then a write succeeds, and write alone names recovery", async () => {
	await withRoot(async (root) => {
		await writeLedger(root, "abc-1", -1, markdown(0, "\noriginal\n"));
		const owner = {
			pid: 999_001,
			host: hostname(),
			timestamp: "2026-03-04T00:00:00.000Z",
		};
		await plantOwner(root, "abc-1", owner);
		const isAlive = () => false;
		try {
			await writeLedger(root, "abc-1", 0, markdown(1, "\nchanged\n"), {
				isAlive,
			});
			throw new Error("write should refuse a dead owner's lock");
		} catch (error) {
			expect(error).toBeInstanceOf(ConcurrencyConflict);
			expect((error as Error).message.toLowerCase()).toContain("recover");
		}
		expect(await lockPresent(root, "abc-1")).toBe(true);
		expect(await readFile(join(root, "abc-1.md"), "utf8")).toContain(
			"original",
		);
		const report = await recoverLock(root, "abc-1", { isAlive });
		expect(report.cleared).toBe(true);
		expect(report.owner?.pid).toBe(owner.pid);
		expect(report.owner?.host).toBe(owner.host);
		expect(report.reason).toContain(String(owner.pid));
		expect(await lockPresent(root, "abc-1")).toBe(false);
		await writeLedger(root, "abc-1", 0, markdown(1, "\nrecovered\n"));
		expect(await readFile(join(root, "abc-1.md"), "utf8")).toContain(
			"recovered",
		);
	});
});

test("recovery leaves a live owner, a foreign host, and an unreadable owner record in place", async () => {
	await withRoot(async (root) => {
		await writeLedger(root, "live", -1, markdown(0));
		await plantOwner(root, "live", { pid: process.pid, host: hostname() });
		const live = await recoverLock(root, "live");
		expect(live.cleared).toBe(false);
		expect(live.reason.length).toBeGreaterThan(0);
		expect(await lockPresent(root, "live")).toBe(true);

		await writeLedger(root, "foreign", -1, markdown(0));
		await plantOwner(root, "foreign", {
			pid: 12,
			host: "other-host.example",
		});
		const foreign = await recoverLock(root, "foreign", {
			isAlive: () => false,
		});
		expect(foreign.cleared).toBe(false);
		expect(foreign.reason.toLowerCase()).toMatch(/host/);
		expect(await lockPresent(root, "foreign")).toBe(true);

		await writeLedger(root, "broken", -1, markdown(0));
		await plantOwner(root, "broken", "unreadable");
		const broken = await recoverLock(root, "broken", { isAlive: () => false });
		expect(broken.cleared).toBe(false);
		expect(broken.reason.length).toBeGreaterThan(0);
		expect(await lockPresent(root, "broken")).toBe(true);
	});
});

test("a concurrency conflict uses a distinct command-line exit code", async () => {
	await withRoot(async (root) => {
		const input = join(root, "input.md");
		await writeLedger(root, "abc-1", -1, markdown(0));
		await writeLedger(root, "abc-1", 0, markdown(1, "\nfirst\n"));
		await writeFile(input, markdown(1, "\nstale\n"));
		const script = join(import.meta.dir, "ledger-store.ts");
		const proc = Bun.spawn(["bun", script, root, "abc-1", "0", input], {
			stdout: "pipe",
			stderr: "pipe",
		});
		const exitCode = await proc.exited;
		expect(CONCURRENCY_CONFLICT_EXIT_CODE).not.toBe(0);
		expect(CONCURRENCY_CONFLICT_EXIT_CODE).not.toBe(1);
		expect(CONCURRENCY_CONFLICT_EXIT_CODE).not.toBe(2);
		expect(exitCode).toBe(CONCURRENCY_CONFLICT_EXIT_CODE);
		expect(await readFile(join(root, "abc-1.md"), "utf8")).toContain("first");
	});
});

const WRITER = join(import.meta.dir, "ledger-store.ts");
const OLDER_LEDGER = readFileSync(
	join(import.meta.dir, "fixtures", "ledger-date-only.md"),
	"utf8",
);
const LEDGER_ID = "ds-6";
const TIME_EXAMPLE = "2026-11-09T13:34:05Z";
const TIMED_STOP = `- ${TIME_EXAMPLE} DS-6 execute — stopped for the operator — /delivery execute DS-6`;
const TIMED_APPROVAL = `- ${TIME_EXAMPLE} DS-6 — approved the plan — operator — "yes"`;
const DATE_ONLY_STOP =
	"- 2026-11-09 DS-6 execute — stopped for the operator — /delivery execute DS-6";
const DATE_ONLY_APPROVAL =
	'- 2026-11-09 DS-6 — approved the plan — operator — "yes"';
const SECTIONS = [
	["Stops", "## Stops", DATE_ONLY_STOP, TIMED_STOP],
	["Approvals", "## Approvals", DATE_ONLY_APPROVAL, TIMED_APPROVAL],
] as const;

function isHeading(line: string, heading: string): boolean {
	return line.trim().toLowerCase() === heading.toLowerCase();
}

function sectionLines(
	ledger: string,
	heading: string,
	occurrence = 0,
): string[] {
	const lines = ledger.split(/\r?\n/);
	const starts = lines.flatMap((line, index) =>
		isHeading(line, heading) ? [index] : [],
	);
	const start = starts[occurrence];
	if (start === undefined) throw new Error(`no ${heading} heading`);
	const body: string[] = [];
	for (const line of lines.slice(start + 1)) {
		if (line.startsWith("## ")) break;
		if (line.trim()) body.push(line.trim());
	}
	return body;
}

function addLine(
	ledger: string,
	heading: string,
	line: string,
	occurrence = 0,
): string {
	const lines = ledger.split("\n");
	const starts = lines.flatMap((text, index) =>
		isHeading(text, heading) ? [index] : [],
	);
	const start = starts[occurrence];
	if (start === undefined) throw new Error(`no ${heading} heading`);
	let end = lines.findIndex(
		(text, index) => index > start && text.startsWith("## "),
	);
	if (end === -1) end = lines.length;
	let at = end;
	while (at > start + 1 && lines[at - 1]?.trim() === "") at--;
	const terminator = lines[at - 1]?.endsWith("\r") ? "\r" : "";
	lines.splice(at, 0, `${line}${terminator}`);
	return lines.join("\n");
}

function removeLine(ledger: string, line: string): string {
	const lines = ledger.split("\n");
	const index = lines.indexOf(line);
	if (index === -1) throw new Error(`no line ${line}`);
	lines.splice(index, 1);
	return lines.join("\n");
}

function replaceLine(ledger: string, from: string, to: string): string {
	if (!ledger.split("\n").includes(from)) throw new Error(`no line ${from}`);
	return ledger
		.split("\n")
		.map((line) => (line === from ? to : line))
		.join("\n");
}

function stateRoot(root: string): string {
	return join(root, "state");
}

async function seed(root: string, id: string, text: string): Promise<void> {
	await mkdir(stateRoot(root), { recursive: true });
	await writeFile(join(stateRoot(root), `${id}.md`), text);
}

async function stored(root: string, id = LEDGER_ID): Promise<string> {
	return readFile(join(stateRoot(root), `${id}.md`), "utf8");
}

async function runWriter(
	root: string,
	expected: number,
	text: string,
	journal?: string,
): Promise<{ exitCode: number; stderr: string }> {
	const input = join(root, "input.md");
	await writeFile(input, text);
	const proc = Bun.spawn(
		["bun", WRITER, stateRoot(root), LEDGER_ID, String(expected), input],
		{
			env: { ...process.env, DELIVERY_WORKER_JOURNAL: journal ?? "" },
			stdout: "pipe",
			stderr: "pipe",
		},
	);
	const [stderr, exitCode] = await Promise.all([
		new Response(proc.stderr).text(),
		proc.exited,
	]);
	return { exitCode, stderr };
}

async function expectRefused(
	root: string,
	text: string,
	expected = 0,
): Promise<string> {
	const before = await stored(root);
	const result = await runWriter(root, expected, text);
	expect(result.exitCode).toBe(1);
	expect(await stored(root)).toBe(before);
	expect(await lockPresent(stateRoot(root), LEDGER_ID)).toBe(false);
	return result.stderr;
}

const FORM = `a UTC time written as ${LEDGER_TIME_FORMAT}, for example ${TIME_EXAMPLE}.`;

function noTimeMessage(section: string, line: string): string {
	return `ledger ${section} line has no UTC time: "${line}". Start new Stops and Approvals lines with ${FORM}`;
}

function lostLineMessage(section: string, line: string): string {
	return `ledger ${section} section lost an older line: "${line}". Older lines are kept exactly as written; new lines start with ${FORM}`;
}

function lostSectionMessage(section: string): string {
	return `ledger lost its ${section} section; every section is kept.`;
}

const OLDER_STOP = sectionLines(OLDER_LEDGER, "## Stops")[0] ?? "";
const OLDER_APPROVAL = sectionLines(OLDER_LEDGER, "## Approvals")[0] ?? "";

const MALFORMED_TIMES = [
	"2026-11-09T13:34:05",
	"2026-11-09T13:34:05+02:00",
	"2026-11-09T13:34:05.000Z",
	"2026-11-09T13:34Z",
	"2026-13-45T25:00:00Z",
	"2026-11-09T13:34:05Z5",
	"2026-11-09T13:34:05Zabc",
];

describe("the older ledger fixture", () => {
	test("has no Generation header and one date-only line in Stops and in Approvals", () => {
		expect(OLDER_LEDGER).not.toMatch(/^Generation:/m);
		expect(ledgerGeneration(OLDER_LEDGER)).toBe(0);
		expect(sectionLines(OLDER_LEDGER, "## Stops")).toHaveLength(1);
		expect(sectionLines(OLDER_LEDGER, "## Approvals")).toHaveLength(1);
		expect(OLDER_STOP).toMatch(/^- \d{4}-\d{2}-\d{2} /);
		expect(OLDER_APPROVAL).toMatch(/^- \d{4}-\d{2}-\d{2} /);
	});
});

describe("every new stop and approval line carries a UTC time", () => {
	test("new stop and approval lines with a UTC time are written", async () => {
		await withRoot(async (root) => {
			await seed(root, LEDGER_ID, OLDER_LEDGER);
			const input = nextLedger(
				addLine(
					addLine(OLDER_LEDGER, "## Stops", TIMED_STOP),
					"## Approvals",
					TIMED_APPROVAL,
				),
				0,
			);
			const result = await runWriter(root, 0, input);
			expect(result.exitCode).toBe(0);
			const written = await stored(root);
			expect(written).toBe(input);
			expect(ledgerGeneration(written)).toBe(1);
			expect(sectionLines(written, "## Stops")).toEqual([
				OLDER_STOP,
				TIMED_STOP,
			]);
			expect(sectionLines(written, "## Approvals")).toEqual([
				OLDER_APPROVAL,
				TIMED_APPROVAL,
			]);
			expect(await lockPresent(stateRoot(root), LEDGER_ID)).toBe(false);
		});
	});

	for (const [section, heading, dateOnly] of SECTIONS) {
		test(`a new ${section} line with a date only is refused with the form and an example`, async () => {
			await withRoot(async (root) => {
				await seed(root, LEDGER_ID, OLDER_LEDGER);
				const stderr = await expectRefused(
					root,
					nextLedger(addLine(OLDER_LEDGER, heading, dateOnly), 0),
				);
				expect(stderr).toContain(section);
				expect(stderr).toContain(`"${dateOnly}"`);
				expect(stderr).toContain(LEDGER_TIME_FORMAT);
				expect(stderr).toContain(TIME_EXAMPLE);
			});
		});
	}

	for (const time of MALFORMED_TIMES) {
		test(`a new stop line beginning ${time} is refused`, async () => {
			await withRoot(async (root) => {
				await seed(root, LEDGER_ID, OLDER_LEDGER);
				const line = `- ${time} DS-6 execute — stopped — /delivery execute DS-6`;
				const stderr = await expectRefused(
					root,
					nextLedger(addLine(OLDER_LEDGER, "## Stops", line), 0),
				);
				expect(stderr).toContain(`"${line}"`);
				expect(stderr).toContain(LEDGER_TIME_FORMAT);
			});
		});
	}

	test("a new stop line that is a UTC time and nothing after it is accepted", async () => {
		await withRoot(async (root) => {
			await seed(root, LEDGER_ID, OLDER_LEDGER);
			const input = nextLedger(
				addLine(OLDER_LEDGER, "## Stops", `- ${TIME_EXAMPLE}`),
				0,
			);
			expect((await runWriter(root, 0, input)).exitCode).toBe(0);
			expect(await stored(root)).toBe(input);
		});
	});

	const NOT_A_SINGLE_TIMED_BULLET: [string, string[]][] = [
		["a bare line", ["continuous-delivery: yes"]],
		[
			"a star bullet",
			[`* ${TIME_EXAMPLE} DS-6 — approved the plan — operator — "yes"`],
		],
		[
			"an indented continuation under a timed bullet",
			[TIMED_APPROVAL, "  and the rest of the operator's words"],
		],
	];
	for (const [name, lines] of NOT_A_SINGLE_TIMED_BULLET) {
		test(`an Approvals entry that is ${name} is refused`, async () => {
			await withRoot(async (root) => {
				await seed(root, LEDGER_ID, OLDER_LEDGER);
				const input = lines.reduce(
					(ledger, line) => addLine(ledger, "## Approvals", line),
					OLDER_LEDGER,
				);
				const stderr = await expectRefused(root, nextLedger(input, 0));
				expect(stderr).toContain((lines.at(-1) ?? "").trim());
			});
		});
	}

	test("a timed bullet on its own is accepted in Approvals", async () => {
		await withRoot(async (root) => {
			await seed(root, LEDGER_ID, OLDER_LEDGER);
			const input = nextLedger(
				addLine(OLDER_LEDGER, "## Approvals", TIMED_APPROVAL),
				0,
			);
			expect((await runWriter(root, 0, input)).exitCode).toBe(0);
			expect(await stored(root)).toBe(input);
		});
	});

	test("the first write of a ledger is checked and creates nothing when refused", async () => {
		await withRoot(async (root) => {
			const refusedInput = markdown(0, `\n## Stops\n\n${DATE_ONLY_STOP}\n`);
			const refused = await runWriter(root, -1, refusedInput);
			expect(refused.exitCode).toBe(1);
			expect(refused.stderr).toContain(`"${DATE_ONLY_STOP}"`);
			await expect(
				stat(join(stateRoot(root), `${LEDGER_ID}.md`)),
			).rejects.toThrow();
			expect(await lockPresent(stateRoot(root), LEDGER_ID)).toBe(false);

			const timedInput = markdown(0, `\n## Stops\n\n${TIMED_STOP}\n`);
			expect((await runWriter(root, -1, timedInput)).exitCode).toBe(0);
			expect(await stored(root)).toBe(timedInput);
		});
	});

	test("a stale generation is reported before the time check", async () => {
		await withRoot(async (root) => {
			const current = nextLedger(OLDER_LEDGER, 0);
			await seed(root, LEDGER_ID, current);
			const input = nextLedger(
				addLine(OLDER_LEDGER, "## Stops", DATE_ONLY_STOP),
				0,
			);
			const result = await runWriter(root, 0, input);
			expect(result.exitCode).toBe(CONCURRENCY_CONFLICT_EXIT_CODE);
			expect(result.stderr).toContain("stale");
			expect(result.stderr).not.toContain(LEDGER_TIME_FORMAT);
			expect(await stored(root)).toBe(current);
		});
	});

	test("a worker journal write is checked the same way", async () => {
		await withRoot(async (root) => {
			const journal = join(root, "workers", "run-1", "work-2.md");
			await mkdir(join(root, "workers", "run-1"), { recursive: true });
			await writeFile(journal, OLDER_LEDGER);

			const refused = await runWriter(
				root,
				0,
				nextLedger(addLine(OLDER_LEDGER, "## Stops", DATE_ONLY_STOP), 0),
				journal,
			);
			expect(refused.exitCode).toBe(1);
			expect(refused.stderr).toContain(`"${DATE_ONLY_STOP}"`);
			expect(await readFile(journal, "utf8")).toBe(OLDER_LEDGER);
			expect(await lockPresent(join(root, "workers", "run-1"), "work-2")).toBe(
				false,
			);

			const accepted = nextLedger(
				addLine(OLDER_LEDGER, "## Stops", TIMED_STOP),
				0,
			);
			expect((await runWriter(root, 0, accepted, journal)).exitCode).toBe(0);
			expect(await readFile(journal, "utf8")).toBe(accepted);
			await expect(
				stat(join(stateRoot(root), `${LEDGER_ID}.md`)),
			).rejects.toThrow();
		});
	});

	test("other sections keep their date-only form", async () => {
		await withRoot(async (root) => {
			await seed(root, LEDGER_ID, OLDER_LEDGER);
			const input = nextLedger(
				addLine(
					addLine(
						OLDER_LEDGER,
						"## Decisions",
						"- 2026-11-09 run — kept the plan — it still fits — https://tracker.example/DS-6",
					),
					"## Lessons",
					"- 2026-11-09 spec — 2 — name the time form once — backlog",
				),
				0,
			);
			expect((await runWriter(root, 0, input)).exitCode).toBe(0);
			expect(await stored(root)).toBe(input);
		});
	});
});

describe("older stop and approval lines are kept exactly and stay accepted", () => {
	test("a date-only ledger is updated and its older lines are untouched", async () => {
		await withRoot(async (root) => {
			await seed(root, LEDGER_ID, OLDER_LEDGER);
			const input = nextLedger(
				addLine(
					OLDER_LEDGER,
					"## Decisions",
					"- 2026-11-09 run — noted a change of plan — the scope shrank — https://tracker.example/DS-6",
				),
				0,
			);
			const result = await runWriter(root, 0, input);
			expect(result.exitCode).toBe(0);
			const written = await stored(root);
			expect(ledgerGeneration(written)).toBe(1);
			expect(sectionLines(written, "## Stops")).toEqual([OLDER_STOP]);
			expect(sectionLines(written, "## Approvals")).toEqual([OLDER_APPROVAL]);
		});
	});

	const CHANGED_OLDER_LINE: [string, (ledger: string) => string][] = [
		[
			"has its wording changed",
			(ledger) =>
				replaceLine(
					ledger,
					OLDER_STOP,
					OLDER_STOP.replace("red gate passed unexpectedly", "the gate failed"),
				),
		],
		[
			"has a made-up UTC time added in front of its date",
			(ledger) =>
				replaceLine(
					ledger,
					OLDER_STOP,
					`- 2026-10-21T09:00:00Z ${OLDER_STOP.slice(2)}`,
				),
		],
		["is removed", (ledger) => removeLine(ledger, OLDER_STOP)],
	];
	for (const [name, change] of CHANGED_OLDER_LINE) {
		test(`an older stop line that ${name} is refused`, async () => {
			await withRoot(async (root) => {
				await seed(root, LEDGER_ID, OLDER_LEDGER);
				const stderr = await expectRefused(
					root,
					nextLedger(change(OLDER_LEDGER), 0),
				);
				expect(stderr).toContain(`"${OLDER_STOP}"`);
				expect(stderr).toContain("kept exactly as written");
				expect(stderr).toContain("start with a UTC time");
			});
		});
	}

	test("removing one of two identical older approval lines is refused", async () => {
		await withRoot(async (root) => {
			const twice = addLine(OLDER_LEDGER, "## Approvals", OLDER_APPROVAL);
			await seed(root, LEDGER_ID, twice);
			const stderr = await expectRefused(
				root,
				nextLedger(removeLine(twice, OLDER_APPROVAL), 0),
			);
			expect(stderr).toContain(`"${OLDER_APPROVAL}"`);
			expect(stderr).toContain("kept exactly as written");
		});
	});

	test("both identical older approval lines carried over are accepted", async () => {
		await withRoot(async (root) => {
			const twice = addLine(OLDER_LEDGER, "## Approvals", OLDER_APPROVAL);
			await seed(root, LEDGER_ID, twice);
			const input = nextLedger(
				addLine(twice, "## Approvals", TIMED_APPROVAL),
				0,
			);
			expect((await runWriter(root, 0, input)).exitCode).toBe(0);
			expect(await stored(root)).toBe(input);
		});
	});
});

describe("the Stops and Approvals sections are found reliably", () => {
	function crlfLedger(): string {
		const second =
			"## Stops\n\n- 2026-10-22 DS-0 draft — an older line under the second heading — /delivery draft DS-0\n";
		return `${OLDER_LEDGER.replace("## Stops", "## stops ")}\n${second}`.replace(
			/\n/g,
			"\r\n",
		);
	}

	for (const occurrence of [0, 1]) {
		test(`a date-only stop line under heading ${occurrence + 1} of a CRLF ledger with a second Stops heading is refused`, async () => {
			await withRoot(async (root) => {
				const older = crlfLedger();
				await seed(root, LEDGER_ID, older);
				const input = nextLedger(
					addLine(older, "## Stops", DATE_ONLY_STOP, occurrence),
					0,
				);
				const stderr = await expectRefused(root, input);
				expect(stderr).toContain(DATE_ONLY_STOP);
			});
		});
	}

	test("a timed stop line under the second heading of a CRLF ledger is accepted", async () => {
		await withRoot(async (root) => {
			const older = crlfLedger();
			await seed(root, LEDGER_ID, older);
			const input = nextLedger(addLine(older, "## Stops", TIMED_STOP, 1), 0);
			expect((await runWriter(root, 0, input)).exitCode).toBe(0);
			expect(await stored(root)).toBe(input);
		});
	});

	const LOST_SECTION: [string, string, string][] = [
		[
			"an input with no Approvals heading",
			"Approvals",
			OLDER_LEDGER.replace(`## Approvals\n\n${OLDER_APPROVAL}\n\n`, ""),
		],
		[
			"an input that renames Stops to a third level heading",
			"Stops",
			OLDER_LEDGER.replace("## Stops", "### Stops"),
		],
	];
	for (const [name, section, changed] of LOST_SECTION) {
		test(`${name} is refused and names the missing ${section} section`, async () => {
			await withRoot(async (root) => {
				expect(changed).not.toBe(OLDER_LEDGER);
				await seed(root, LEDGER_ID, OLDER_LEDGER);
				const heading = section === "Stops" ? "### Stops" : "## Stops";
				const input = nextLedger(addLine(changed, heading, DATE_ONLY_STOP), 0);
				const stderr = await expectRefused(root, input);
				expect(stderr).toContain(lostSectionMessage(section));
			});
		});
	}
});

describe("isLedgerTime", () => {
	test("accepts a whole second UTC instant with a literal Z", () => {
		for (const time of [
			TIME_EXAMPLE,
			"2026-01-01T00:00:00Z",
			"2026-12-31T23:59:59Z",
			"2024-02-29T10:00:00Z",
		]) {
			expect([time, isLedgerTime(time)]).toEqual([time, true]);
		}
	});

	test("refuses every other shape and every impossible instant", () => {
		for (const time of [
			...MALFORMED_TIMES,
			"",
			"2026-11-09",
			"2026-11-09 13:34:05Z",
			"2026-11-09T13:34:05z",
			"2026-11-09t13:34:05Z",
			"26-11-09T13:34:05Z",
			"+012026-11-09T13:34:05Z",
			"2026-11-09T24:00:00Z",
			"2026-11-09T13:60:00Z",
			"2026-11-09T13:34:60Z",
			"2026-02-30T10:00:00Z",
			"2026-02-29T10:00:00Z",
			"2026-00-10T10:00:00Z",
			" 2026-11-09T13:34:05Z",
			"2026-11-09T13:34:05Z ",
		]) {
			expect([time, isLedgerTime(time)]).toEqual([time, false]);
		}
	});

	test("the exported form is the placeholder the format page shows", () => {
		expect(LEDGER_TIME_FORMAT).toBe("yyyy-mm-ddThh:mm:ssZ");
	});
});

describe("ledgerEntryProblems", () => {
	function withLine(ledger: string, heading: string, line: string): string {
		return addLine(ledger, heading, line);
	}

	test("is empty when nothing changed and when no section is involved", () => {
		expect(ledgerEntryProblems(OLDER_LEDGER, OLDER_LEDGER)).toEqual([]);
		expect(ledgerEntryProblems("", markdown(0, "\nbody\n"))).toEqual([]);
		expect(
			ledgerEntryProblems(
				"",
				markdown(0, "\n### Stops\n\n- 2026-11-09 not a section\n"),
			),
		).toEqual([]);
	});

	for (const [section, heading, dateOnly, timed] of SECTIONS) {
		test(`names the ${section} section and quotes a new line with no time`, () => {
			expect(
				ledgerEntryProblems(
					OLDER_LEDGER,
					withLine(OLDER_LEDGER, heading, dateOnly),
				),
			).toEqual([noTimeMessage(section, dateOnly)]);
			expect(
				ledgerEntryProblems(
					OLDER_LEDGER,
					withLine(OLDER_LEDGER, heading, timed),
				),
			).toEqual([]);
		});
	}

	test("names the section and quotes an older line that is no longer there", () => {
		expect(
			ledgerEntryProblems(OLDER_LEDGER, removeLine(OLDER_LEDGER, OLDER_STOP)),
		).toEqual([lostLineMessage("Stops", OLDER_STOP)]);
		expect(
			ledgerEntryProblems(
				OLDER_LEDGER,
				removeLine(OLDER_LEDGER, OLDER_APPROVAL),
			),
		).toEqual([lostLineMessage("Approvals", OLDER_APPROVAL)]);
	});

	test("names a lost section first and does not also report its older lines as lost", () => {
		const renamed = ledgerEntryProblems(
			OLDER_LEDGER,
			OLDER_LEDGER.replace("## Stops", "### Stops"),
		);
		expect(renamed[0]).toBe(lostSectionMessage("Stops"));
		expect(renamed.join("\n")).not.toContain("lost an older line");
		const dropped = ledgerEntryProblems(
			OLDER_LEDGER,
			OLDER_LEDGER.replace(`## Approvals\n\n${OLDER_APPROVAL}\n\n`, ""),
		);
		expect(dropped[0]).toBe(lostSectionMessage("Approvals"));
		expect(dropped.join("\n")).not.toContain("lost an older line");
	});

	test("reports an edited older line as a lost line first and a line without a time second", () => {
		const edited = replaceLine(
			OLDER_LEDGER,
			OLDER_STOP,
			OLDER_STOP.replace("DS-0", "DS-9"),
		);
		const problems = ledgerEntryProblems(OLDER_LEDGER, edited);
		expect(problems).toHaveLength(2);
		expect(problems[0]).toBe(lostLineMessage("Stops", OLDER_STOP));
		expect(problems[1]).toBe(
			noTimeMessage("Stops", OLDER_STOP.replace("DS-0", "DS-9")),
		);
	});

	test("treats every line of a first write as new", () => {
		expect([...ledgerEntryProblems("", OLDER_LEDGER)].sort()).toEqual(
			[
				noTimeMessage("Approvals", OLDER_APPROVAL),
				noTimeMessage("Stops", OLDER_STOP),
			].sort(),
		);
	});

	test("compares lines with surrounding whitespace trimmed and checks a new line trimmed", () => {
		expect(
			ledgerEntryProblems(
				OLDER_LEDGER,
				replaceLine(OLDER_LEDGER, OLDER_STOP, `   ${OLDER_STOP}  `),
			),
		).toEqual([]);
		expect(
			ledgerEntryProblems(
				OLDER_LEDGER,
				withLine(OLDER_LEDGER, "## Stops", `   ${TIMED_STOP}   `),
			),
		).toEqual([]);
	});

	test("counts repeats on both sides", () => {
		const twice = withLine(OLDER_LEDGER, "## Approvals", OLDER_APPROVAL);
		expect(ledgerEntryProblems(twice, twice)).toEqual([]);
		expect(ledgerEntryProblems(twice, OLDER_LEDGER)).toEqual([
			lostLineMessage("Approvals", OLDER_APPROVAL),
		]);
		expect(ledgerEntryProblems(OLDER_LEDGER, twice)).toEqual([
			noTimeMessage("Approvals", OLDER_APPROVAL),
		]);
	});

	test("reads the lines of every occurrence of a heading as one section", () => {
		const second = `${OLDER_LEDGER}\n## Stops\n\n- ${TIME_EXAMPLE} DS-6 execute — second heading — /delivery execute DS-6\n`;
		expect(ledgerEntryProblems(OLDER_LEDGER, second)).toEqual([]);
		const moved = `${removeLine(OLDER_LEDGER, OLDER_STOP)}\n## Stops\n\n${OLDER_STOP}\n`;
		expect(ledgerEntryProblems(OLDER_LEDGER, moved)).toEqual([]);
		const badSecond = `${OLDER_LEDGER}\n## Stops\n\n${DATE_ONLY_STOP}\n`;
		expect(ledgerEntryProblems(OLDER_LEDGER, badSecond)).toEqual([
			noTimeMessage("Stops", DATE_ONLY_STOP),
		]);
	});

	test("matches headings without regard to case, trailing whitespace or carriage returns", () => {
		for (const heading of ["## STOPS", "## stops   ", "## Stops\r"]) {
			const older = OLDER_LEDGER.replace("## Stops", heading);
			expect([
				heading,
				ledgerEntryProblems(older, addLine(older, "## Stops", DATE_ONLY_STOP)),
			]).toEqual([heading, [noTimeMessage("Stops", DATE_ONLY_STOP)]]);
		}
	});

	test("does not take a line moved to the other kind of section as carried over", () => {
		const moved = withLine(
			removeLine(OLDER_LEDGER, OLDER_STOP),
			"## Approvals",
			OLDER_STOP,
		);
		const problems = ledgerEntryProblems(OLDER_LEDGER, moved);
		expect(problems).toHaveLength(2);
		expect(problems).toContain(lostLineMessage("Stops", OLDER_STOP));
		expect(problems).toContain(noTimeMessage("Approvals", OLDER_STOP));
	});

	test("leaves the other sections alone", () => {
		const input = withLine(
			withLine(
				OLDER_LEDGER,
				"## Decisions",
				"- 2026-11-09 run — kept — why — link",
			),
			"## Lessons",
			"- 2026-11-09 spec — 1 — lesson — backlog",
		);
		expect(ledgerEntryProblems(OLDER_LEDGER, input)).toEqual([]);
	});

	test("refuses a line whose bullet is not exactly a dash and a space before the time", () => {
		for (const line of [
			`-${TIME_EXAMPLE} DS-6 stopped`,
			`* ${TIME_EXAMPLE} DS-6 stopped`,
			`${TIME_EXAMPLE} DS-6 stopped`,
			"continuous-delivery: yes",
		]) {
			expect([
				line,
				ledgerEntryProblems(
					OLDER_LEDGER,
					withLine(OLDER_LEDGER, "## Stops", line),
				),
			]).toEqual([line, [noTimeMessage("Stops", line)]]);
		}
	});
});

describe("writeLedger refuses a bad stop or approval line", () => {
	test("throws a plain error whose message joins the problems, and leaves the ledger and lock alone", async () => {
		await withRoot(async (root) => {
			await seed(root, LEDGER_ID, OLDER_LEDGER);
			const input = nextLedger(
				addLine(
					removeLine(OLDER_LEDGER, OLDER_APPROVAL),
					"## Stops",
					DATE_ONLY_STOP,
				),
				0,
			);
			const problems = ledgerEntryProblems(OLDER_LEDGER, input);
			expect(problems.length).toBeGreaterThan(1);
			try {
				await writeLedger(stateRoot(root), LEDGER_ID, 0, input);
				throw new Error("the write should have been refused");
			} catch (error) {
				expect(error).not.toBeInstanceOf(ConcurrencyConflict);
				expect((error as Error).message).toBe(problems.join("\n"));
			}
			expect(await stored(root)).toBe(OLDER_LEDGER);
			expect(await lockPresent(stateRoot(root), LEDGER_ID)).toBe(false);
		});
	});

	test("a stale write still reports the conflict, not the time problem", async () => {
		await withRoot(async (root) => {
			await seed(root, LEDGER_ID, nextLedger(OLDER_LEDGER, 0));
			const input = nextLedger(
				addLine(OLDER_LEDGER, "## Stops", DATE_ONLY_STOP),
				0,
			);
			await expect(
				writeLedger(stateRoot(root), LEDGER_ID, 0, input),
			).rejects.toBeInstanceOf(ConcurrencyConflict);
		});
	});
});

describe("ledgerLineTime", () => {
	test("returns the time of a bullet that starts with a UTC time, followed by a space or nothing", () => {
		for (const line of [
			TIMED_STOP,
			TIMED_APPROVAL,
			`- ${TIME_EXAMPLE}`,
			`  ${TIMED_STOP}  `,
		]) {
			expect([line, ledgerLineTime(line)]).toEqual([line, TIME_EXAMPLE]);
		}
	});

	test("returns nothing for a date-only line, a bullet that is not a dash and a space, or a time that is not exact", () => {
		for (const line of [
			DATE_ONLY_STOP,
			DATE_ONLY_APPROVAL,
			`-${TIME_EXAMPLE} DS-6 stopped`,
			`* ${TIME_EXAMPLE} DS-6 stopped`,
			`${TIME_EXAMPLE} DS-6 stopped`,
			`- ${TIME_EXAMPLE}\tDS-6 stopped`,
			"continuous-delivery: yes",
			"",
			...MALFORMED_TIMES.map((time) => `- ${time} DS-6 stopped`),
		]) {
			expect([line, ledgerLineTime(line)]).toEqual([line, undefined]);
		}
	});

	test("agrees with what the writer accepts on a new Stops line", () => {
		for (const line of [
			TIMED_STOP,
			`- ${TIME_EXAMPLE}`,
			DATE_ONLY_STOP,
			`-${TIME_EXAMPLE} DS-6 stopped`,
			`- ${TIME_EXAMPLE}Zabc DS-6 stopped`,
			...MALFORMED_TIMES.map((time) => `- ${time} DS-6 stopped`),
		]) {
			const problems = ledgerEntryProblems(
				"",
				markdown(0, `\n## Stops\n\n${line}\n`),
			);
			expect([line, problems.length === 0]).toEqual([
				line,
				ledgerLineTime(line) !== undefined,
			]);
		}
	});
});

describe("ledgerEntryLines", () => {
	const LEDGER_TEXT = [
		"# Run",
		"",
		"## Decisions",
		"",
		"- 2026-11-09 run — a decision — why — link",
		"",
		"## Approvals",
		"",
		TIMED_APPROVAL,
		"",
		"## Stops",
		"",
		DATE_ONLY_STOP,
		"continuous-delivery: yes",
		"",
		TIMED_STOP,
		"",
		"## Lessons",
		"",
		"- 2026-11-09 spec — 1 — a lesson — accepted",
		"",
	].join("\n");

	test("returns the trimmed non-blank lines of the named section, whatever their shape", () => {
		expect(ledgerEntryLines(LEDGER_TEXT, "Stops")).toEqual([
			DATE_ONLY_STOP,
			"continuous-delivery: yes",
			TIMED_STOP,
		]);
		expect(ledgerEntryLines(LEDGER_TEXT, "Approvals")).toEqual([
			TIMED_APPROVAL,
		]);
		expect(ledgerEntryLines(LEDGER_TEXT, "Decisions")).toEqual([
			"- 2026-11-09 run — a decision — why — link",
		]);
	});

	test("finds the heading without regard to case, trailing whitespace or carriage returns", () => {
		for (const heading of ["## STOPS", "## stops   ", "## Stops\r"]) {
			const text = LEDGER_TEXT.replace("## Stops", heading);
			expect([heading, ledgerEntryLines(text, "Stops")]).toEqual([
				heading,
				[DATE_ONLY_STOP, "continuous-delivery: yes", TIMED_STOP],
			]);
		}
		expect(
			ledgerEntryLines(LEDGER_TEXT.replace(/\n/g, "\r\n"), "Stops"),
		).toEqual([DATE_ONLY_STOP, "continuous-delivery: yes", TIMED_STOP]);
	});

	test("reads every occurrence of a heading as one section, in file order", () => {
		const second = `${LEDGER_TEXT}\n## Stops\n\n- ${TIME_EXAMPLE} DS-7 review — second heading — /delivery review DS-7\n`;
		expect(ledgerEntryLines(second, "Stops")).toEqual([
			DATE_ONLY_STOP,
			"continuous-delivery: yes",
			TIMED_STOP,
			`- ${TIME_EXAMPLE} DS-7 review — second heading — /delivery review DS-7`,
		]);
	});

	test("ignores a deeper heading, and returns nothing for a section that is absent", () => {
		expect(
			ledgerEntryLines(LEDGER_TEXT.replace("## Stops", "### Stops"), "Stops"),
		).toEqual([]);
		expect(ledgerEntryLines("# Run\n", "Stops")).toEqual([]);
		expect(ledgerEntryLines("", "Decisions")).toEqual([]);
	});

	test("finds the same lines the writer compares", () => {
		const added = addLine(OLDER_LEDGER, "## Stops", TIMED_STOP);
		expect(ledgerEntryLines(added, "Stops")).toEqual([OLDER_STOP, TIMED_STOP]);
		expect(ledgerEntryLines(added, "Approvals")).toEqual([OLDER_APPROVAL]);
	});
});

describe("a needs-validation acknowledgement is an ordinary Approvals line", () => {
	const ACKNOWLEDGEMENT = `- ${TIME_EXAMPLE} !840 — ${NEEDS_VALIDATION_ACK_PHRASE} NV-0a1b2c3d — Sam Rivera — "Checked the replica count with the platform team."`;
	const DATE_ONLY_ACKNOWLEDGEMENT = ACKNOWLEDGEMENT.replace(
		TIME_EXAMPLE,
		"2026-11-09",
	);

	test("the writer accepts the line with a UTC time and keeps every older line", async () => {
		await withRoot(async (root) => {
			await seed(root, LEDGER_ID, OLDER_LEDGER);
			const input = nextLedger(
				addLine(OLDER_LEDGER, "## Approvals", ACKNOWLEDGEMENT),
				0,
			);
			const result = await runWriter(root, 0, input);
			expect(result.exitCode).toBe(0);
			expect(sectionLines(await stored(root), "## Approvals")).toEqual([
				OLDER_APPROVAL,
				ACKNOWLEDGEMENT,
			]);
		});
	});

	test("the writer refuses the same line written with a date only", async () => {
		await withRoot(async (root) => {
			await seed(root, LEDGER_ID, OLDER_LEDGER);
			const stderr = await expectRefused(
				root,
				nextLedger(
					addLine(OLDER_LEDGER, "## Approvals", DATE_ONLY_ACKNOWLEDGEMENT),
					0,
				),
			);
			expect(stderr).toContain(`"${DATE_ONLY_ACKNOWLEDGEMENT}"`);
			expect(stderr).toContain(LEDGER_TIME_FORMAT);
		});
	});

	test("the reader that the writer exports returns the line as an Approvals entry", () => {
		const added = addLine(OLDER_LEDGER, "## Approvals", ACKNOWLEDGEMENT);
		expect(ledgerEntryLines(added, "Approvals")).toEqual([
			OLDER_APPROVAL,
			ACKNOWLEDGEMENT,
		]);
	});
});
