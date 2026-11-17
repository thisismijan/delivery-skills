import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	SIZE_WARN_CHARS,
	SIZE_WARN_LINES,
	fillHousekeepingSections,
	verifyTicket,
} from "./verify-ticket";

const SCRIPT = join(import.meta.dir, "verify-ticket.ts");

const FIRST_CRITERION =
	"- [ ] Given an invoice older than a year, When the nightly job runs, Then it moves to the archive";
const SECOND_CRITERION =
	"- [ ] Given an archived invoice, When a clerk searches for it, Then it is listed as archived";

const BASE = {
	Context: "Finance keeps every invoice in the live table forever.",
	"User stories":
		"- As a clerk I want old invoices archived so that search stays fast.",
	"What to build":
		"A nightly job that archives invoices past their first year.",
	"Acceptance criteria": `${FIRST_CRITERION}\n${SECOND_CRITERION}`,
	"Out of scope": "Restoring archived invoices.",
	"Blocked by": "Nothing.",
};

type Section = keyof typeof BASE;
const SECTIONS = Object.keys(BASE) as Section[];

function ticket(changes: Partial<Record<Section, string | null>> = {}): string {
	const merged: Record<string, string | null> = { ...BASE, ...changes };
	const parts = SECTIONS.flatMap((name) => {
		const body = merged[name];
		return body === null || body === undefined
			? []
			: [`## ${name}\n\n${body}\n`];
	});
	return ["# Archive old invoices", "", ...parts].join("\n");
}

function criteria(count: number): string {
	return Array.from(
		{ length: count },
		(_, i) =>
			`- [ ] Given setup ${i}, When step ${i} runs, Then result ${i} holds`,
	).join("\n");
}

function stories(count: number, numbered = false): string {
	return Array.from({ length: count }, (_, i) =>
		numbered
			? `${i + 1}. As a clerk I want feature ${i} so that I save time.`
			: `- As a clerk I want feature ${i} so that I save time.`,
	).join("\n");
}

let scratch = "";
let fileCount = 0;

async function onDisk(content: string): Promise<string> {
	fileCount += 1;
	const path = join(scratch, `ticket-${fileCount}.md`);
	await writeFile(path, content, "utf8");
	return path;
}

function cli(...args: string[]) {
	const run = Bun.spawnSync([process.execPath, SCRIPT, ...args], {
		env: process.env,
	});
	return {
		code: run.exitCode,
		stdout: run.stdout.toString(),
		stderr: run.stderr.toString(),
	};
}

beforeAll(async () => {
	scratch = await mkdtemp(join(tmpdir(), "verify-ticket-"));
});

afterAll(async () => {
	await rm(scratch, { recursive: true, force: true });
});

describe("a complete ticket", () => {
	test("passes when read from a file", async () => {
		const result = await verifyTicket(await onDisk(ticket()));
		expect(result).toEqual({ ok: true, missing: [], warnings: [] });
	});

	test("passes when given as text", async () => {
		expect(await verifyTicket(ticket())).toEqual({
			ok: true,
			missing: [],
			warnings: [],
		});
	});

	test("passes with one, two, or three criteria", async () => {
		for (const count of [1, 2, 3]) {
			const result = await verifyTicket(
				ticket({ "Acceptance criteria": criteria(count) }),
			);
			expect(result.ok).toBe(true);
		}
	});

	test("counts a ticked criterion the same as an open one", async () => {
		const ticked = FIRST_CRITERION.replace("- [ ]", "- [x]");
		const upper = SECOND_CRITERION.replace("- [ ]", "- [X]");
		const result = await verifyTicket(
			ticket({ "Acceptance criteria": `${ticked}\n${upper}` }),
		);
		expect(result.ok).toBe(true);
	});

	test("returns a plain object that survives a JSON round trip", async () => {
		const result = await verifyTicket(await onDisk(ticket()));
		expect(typeof result.ok).toBe("boolean");
		expect(result.missing).toBeArray();
		expect(result.warnings).toBeArray();
		expect(JSON.parse(JSON.stringify(result))).toEqual(result);
		expect(Object.keys(result)).toEqual(["ok", "missing", "warnings"]);
	});
});

describe("required sections", () => {
	for (const section of SECTIONS) {
		test(`a ticket without ${section} fails and names it`, async () => {
			const result = await verifyTicket(
				await onDisk(ticket({ [section]: null })),
			);
			expect(result.ok).toBe(false);
			expect(result.missing).toContain(`Missing required section: ${section}`);
		});
	}

	test("an empty file fails every check it can", async () => {
		const result = await verifyTicket(await onDisk(""));
		expect(result.ok).toBe(false);
		expect(result.missing).toHaveLength(SECTIONS.length + 1);
	});

	test("a big ticket missing a section still fails", async () => {
		const filler = "Detail line.\n".repeat(SIZE_WARN_LINES);
		const result = await verifyTicket(
			ticket({ Context: filler, "Blocked by": null }),
		);
		expect(result.ok).toBe(false);
		expect(result.warnings).toHaveLength(1);
	});
});

describe("acceptance criteria", () => {
	test("a section with prose and no checkbox fails and says what is missing", async () => {
		const result = await verifyTicket(
			await onDisk(
				ticket({ "Acceptance criteria": "Clerks should be happier." }),
			),
		);
		expect(result.ok).toBe(false);
		expect(result.missing).toHaveLength(1);
		expect(result.missing[0]).toStartWith("Missing acceptance criteria");
		expect(result.missing[0]?.toLowerCase()).toMatch(
			/acceptance criteria|criterion|checkbox/,
		);
	});

	test("more than three criteria fails and asks for a split", async () => {
		const result = await verifyTicket(
			ticket({ "Acceptance criteria": criteria(4) }),
		);
		expect(result.ok).toBe(false);
		expect(result.missing).toHaveLength(1);
		const [gap = ""] = result.missing;
		expect(gap).toStartWith("Too many acceptance criteria");
		expect(gap).toContain("4");
		expect(gap).toContain("at most three");
		expect(gap).toContain("atomic vertical tickets");
	});

	test("a criterion that is not Given/When/Then fails", async () => {
		const result = await verifyTicket(
			ticket({
				"Acceptance criteria": `${FIRST_CRITERION}\n- [ ] Old invoices are archived`,
			}),
		);
		expect(result.ok).toBe(false);
		expect(result.missing.join(" ").toLowerCase()).toMatch(
			/given.*when.*then|given\/when\/then/,
		);
		expect(result.missing.join(" ")).toContain("Old invoices are archived");
	});

	test("only the first criterion out of order is reported", async () => {
		const result = await verifyTicket(
			ticket({
				"Acceptance criteria": [
					"- [ ] Then it is archived, When the job runs, Given an old invoice",
					"- [ ] Archived invoices are searchable",
				].join("\n"),
			}),
		);
		expect(result.missing).toHaveLength(1);
		expect(result.missing[0]).toContain("Then it is archived");
	});

	test("Given/When/Then matching ignores case and allows an And clause", async () => {
		const result = await verifyTicket(
			ticket({
				"Acceptance criteria": [
					"- [ ] given a draft invoice, when it is saved And approved, then it is posted",
					"- [ ] GIVEN a posted invoice WHEN a year passes THEN it is archived",
				].join("\n"),
			}),
		);
		expect(result).toEqual({ ok: true, missing: [], warnings: [] });
	});

	test("checkboxes in other sections are not criteria", async () => {
		const result = await verifyTicket(
			ticket({
				Context: `${BASE.Context}\n- [ ] a stray checklist item`,
				"Acceptance criteria": `${FIRST_CRITERION}\n${SECOND_CRITERION}\n${criteria(1)}`,
			}),
		);
		expect(result.ok).toBe(true);
	});

	test("checkboxes inside a fenced block are not criteria", async () => {
		const fenced = ["```", "- [ ] sample only", "- [ ] another"].join("\n");
		const withFence = await verifyTicket(
			ticket({
				"Acceptance criteria": `${fenced}\n\`\`\`\n${FIRST_CRITERION}`,
			}),
		);
		expect(withFence.ok).toBe(true);
		const onlyFence = await verifyTicket(
			ticket({ "Acceptance criteria": `${fenced}\n\`\`\`` }),
		);
		expect(onlyFence.missing[0]).toStartWith("Missing acceptance criteria");
	});
});

describe("user stories", () => {
	test("one story passes", async () => {
		expect(await verifyTicket(ticket({ "User stories": stories(1) }))).toEqual({
			ok: true,
			missing: [],
			warnings: [],
		});
	});

	test("a section with prose and no list item passes", async () => {
		const result = await verifyTicket(
			ticket({
				"User stories": "Stories will be written once finance agrees.",
			}),
		);
		expect(result.ok).toBe(true);
	});

	for (const [count, numbered] of [
		[2, false],
		[3, false],
		[2, true],
	] as const) {
		test(`${count} ${numbered ? "numbered" : "bulleted"} stories fail`, async () => {
			const result = await verifyTicket(
				ticket({ "User stories": stories(count, numbered) }),
			);
			expect(result.ok).toBe(false);
			const [gap = ""] = result.missing;
			expect(gap).toStartWith("Too many user stories");
			expect(gap).toContain(String(count));
			expect(gap.toLowerCase()).toContain("user stories");
		});
	}

	test("star, plus, and closing-parenthesis list items all count", async () => {
		const result = await verifyTicket(
			ticket({ "User stories": "* first\n+ second\n3) third" }),
		);
		expect(result.missing[0]).toContain("3");
	});
});

describe("size warning", () => {
	test("a ticket over the line limit warns but still passes", async () => {
		const filler = "Background line.\n".repeat(SIZE_WARN_LINES);
		const result = await verifyTicket(
			await onDisk(ticket({ Context: filler })),
		);
		expect(result.ok).toBe(true);
		expect(result.warnings).toHaveLength(1);
		expect(result.warnings[0]).toStartWith("Draft is large");
	});

	test("a ticket over the character limit warns but still passes", async () => {
		const filler = "x".repeat(SIZE_WARN_CHARS);
		const result = await verifyTicket(ticket({ "What to build": filler }));
		expect(result.ok).toBe(true);
		expect(result.warnings).toHaveLength(1);
	});

	test("a ticket at exactly the line limit does not warn", async () => {
		const draft = ticket();
		const lines = draft.split("\n").length;
		const padded = `${draft}${"\n".repeat(SIZE_WARN_LINES - lines)}`;
		expect(padded.split("\n")).toHaveLength(SIZE_WARN_LINES);
		expect((await verifyTicket(padded)).warnings).toEqual([]);
		expect((await verifyTicket(`${padded}\n`)).warnings).toHaveLength(1);
	});

	test("a big ticket that fails other checks still reports a result and the warning", async () => {
		const filler = "- As a clerk I want more.\n".repeat(300);
		const result = await verifyTicket(
			await onDisk(
				ticket({
					Context: filler,
					"What to build": filler,
					"Acceptance criteria": criteria(50),
				}),
			),
		);
		expect(result.ok).toBe(false);
		expect(result.warnings).toHaveLength(1);
	});
});

describe("fillHousekeepingSections", () => {
	test("adds Out of scope and Blocked by as None. and the result passes", async () => {
		const draft = ticket({ "Out of scope": null, "Blocked by": null });
		const first = await verifyTicket(draft);
		expect(first.ok).toBe(false);
		const filled = fillHousekeepingSections(draft, first.missing);
		expect(filled).not.toBeNull();
		expect(filled).toEndWith(
			"\n\n## Out of scope\nNone.\n\n## Blocked by\nNone.\n",
		);
		expect(await verifyTicket(filled ?? "")).toEqual({
			ok: true,
			missing: [],
			warnings: [],
		});
	});

	test("fills one housekeeping section on its own", () => {
		const filled = fillHousekeepingSections("## Context\n\n\n", [
			"Missing required section: Blocked by",
		]);
		expect(filled).toBe("## Context\n\n## Blocked by\nNone.\n");
	});

	test("refuses when any other gap is present", async () => {
		const draft = ticket({ Context: null, "Blocked by": null });
		const first = await verifyTicket(draft);
		expect(first.missing).toContain("Missing required section: Blocked by");
		expect(fillHousekeepingSections(draft, first.missing)).toBeNull();
	});

	test("refuses when nothing is missing", () => {
		expect(fillHousekeepingSections(ticket(), [])).toBeNull();
	});
});

describe("command line", () => {
	test("prints the result as JSON and exits 0 on a pass and 1 on a failure", async () => {
		const pass = cli(await onDisk(ticket()));
		expect(pass.code).toBe(0);
		expect(JSON.parse(pass.stdout)).toEqual({
			ok: true,
			missing: [],
			warnings: [],
		});
		const fail = cli(await onDisk(ticket({ Context: null })));
		expect(fail.code).toBe(1);
		expect(JSON.parse(fail.stdout).missing).toEqual([
			"Missing required section: Context",
		]);
	});

	test("exits 2 with the usage line when no draft is given", () => {
		for (const args of [[], ["--fill-housekeeping"]]) {
			const run = cli(...args);
			expect(run.code).toBe(2);
			expect(run.stderr).toContain(
				"usage: verify-ticket [--fill-housekeeping] <draftPath|draftText>",
			);
		}
	});

	test("--fill-housekeeping rewrites the file in place and marks the result filled", async () => {
		const path = await onDisk(
			ticket({ "Out of scope": null, "Blocked by": null }),
		);
		const run = cli("--fill-housekeeping", path);
		expect(run.code).toBe(0);
		expect(JSON.parse(run.stdout)).toEqual({
			ok: true,
			missing: [],
			warnings: [],
			filled: true,
		});
		expect(await readFile(path, "utf8")).toContain("## Blocked by\nNone.\n");
	});

	test("--fill-housekeeping leaves the file alone when other gaps remain", async () => {
		const original = ticket({ Context: null, "Out of scope": null });
		const path = await onDisk(original);
		const run = cli("--fill-housekeeping", path);
		expect(run.code).toBe(1);
		expect(JSON.parse(run.stdout).ok).toBe(false);
		expect(await readFile(path, "utf8")).toBe(original);
	});

	test("--fill-housekeeping never writes when the draft is inline text", () => {
		const run = cli(
			"--fill-housekeeping",
			ticket({ "Out of scope": null, "Blocked by": null }),
		);
		expect(run.code).toBe(1);
		expect(JSON.parse(run.stdout).filled).toBeUndefined();
	});
});
