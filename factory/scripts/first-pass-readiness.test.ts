import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { META_FILENAME } from "./change-meta";
import { routeComprehension, routeReadiness } from "./draft-route";
import { SKIPPED_WORKERS, persistSkipBatch } from "./record-skip";
import { loadConstitution } from "./sdlc-constitution";
import { parseExplainBackVerdict, parseReadinessVerdict } from "./verdicts";

const ROOT = join(import.meta.dir, "..");
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");
const plain = (text: string) =>
	text.replace(/[*`\n]+/g, " ").replace(/\s+/g, " ");

const draft = read("../skills/draft/SKILL.md");
const ROUTE_SCRIPT = join(import.meta.dir, "draft-route.ts");
const STOP_ID = "unready-change";
const EXPLAIN_BACK_STOP_ID = "unsettled-comprehension";
const AGENT_NAME = "first-pass-reviewer";
const SKIP_ID = "first-pass-reviewer-<work-item-key>";
const EXTENSIONS = [
	".ts",
	".md",
	".json",
	".yml",
	".yaml",
	".py",
	".java",
	".sh",
	".toml",
	".xml",
];
const extensionList = new RegExp(
	EXTENSIONS.map((ext) => ext.replace(".", "\\.")).join("[\\s,]*(?:or\\s+)?"),
);

const untestable = {
	kind: "untestable_scenario",
	where: "openspec/changes/example/specs/thing/spec.md, scenario Works",
	detail:
		"its THEN says the feature works correctly, which no test can observe",
};
const missingFile = {
	kind: "missing_file",
	where: "factory/scripts/no-such-helper.ts",
	detail: "the path is not present in the repository and is not marked new",
};
const unnamedInterface = {
	kind: "unnamed_interface",
	where: "openspec/changes/example/design.md, requirement Retry",
	detail: "the change needs a new helper but never names the function",
};
const taskContradiction = {
	kind: "task_contradiction",
	where: "openspec/changes/example/tasks.md, task 1.4",
	detail: "the task proves a scenario the specs do not contain",
};
const unreadableFile = {
	kind: "missing_file",
	where: "factory/scripts/locked-file.ts",
	detail: "the path could not be read: permission denied",
};
const everyKind = [
	untestable,
	missingFile,
	unnamedInterface,
	taskContradiction,
];

const verdict = (value: Record<string, unknown>) => ({
	verdict: "ready",
	reasoning:
		"Every scenario is testable and every named path and interface exists.",
	items: [],
	...value,
});
const notReady = (items: unknown[] = [untestable]) =>
	verdict({
		verdict: "not_ready",
		reasoning: "An implementer would have to guess.",
		items,
	});
const parse = (value: Record<string, unknown>) =>
	parseReadinessVerdict(JSON.stringify(value));

const runRoute = (input: string, attempt: string) => {
	const result = Bun.spawnSync(
		["bun", ROUTE_SCRIPT, "readiness", input, attempt],
		{ stdout: "pipe", stderr: "pipe" },
	);
	return { exitCode: result.exitCode, stdout: result.stdout.toString() };
};

const stepHeading = /^\d+[a-z]?\.\s+\*\*/m;
function stepFrom(heading: RegExp): string {
	const start = draft.search(heading);
	expect(start).toBeGreaterThan(-1);
	const rest = draft.slice(start + 1);
	const end = rest.search(stepHeading);
	return plain(end === -1 ? rest : rest.slice(0, end));
}
const readinessStep = () => stepFrom(/^7c\.\s+\*\*/m);
const readinessProcedure = () =>
	plain(read("../skills/draft/reference/first-pass-readiness.md"));
const readinessSkipRecovery = () =>
	plain(read("../skills/draft/reference/readiness-skip.md"));
const CHECKED_PATHS_START = "List the checked paths";
const CHECKED_PATHS_END = "Persist its single JSON verdict";
function checkedPathParagraph(): string {
	const step = readinessProcedure();
	const start = step.indexOf(CHECKED_PATHS_START);
	if (start === -1) {
		throw new Error(
			`the readiness reference has no checked-path paragraph: marker "${CHECKED_PATHS_START}" not found`,
		);
	}
	const end = step.indexOf(CHECKED_PATHS_END, start);
	if (end === -1) {
		throw new Error(
			`the readiness reference checked-path paragraph has no end: marker "${CHECKED_PATHS_END}" not found after "${CHECKED_PATHS_START}"`,
		);
	}
	return step.slice(start, end);
}
const explainBackStep = () =>
	stepFrom(/^\d+[a-z]?\.\s+\*\*[^\n]*explain[- ]back[^\n]*/im);

const agentPath = "agents/first-pass-reviewer.md";
const agentText = () => read(agentPath);

const tempRoots: string[] = [];
afterEach(() => {
	for (const dir of tempRoots.splice(0)) {
		rmSync(dir, { recursive: true, force: true });
	}
});

describe("readiness placement in draft", () => {
	test("order of gates: explain-back, then readiness, then artifact verification", () => {
		const approach = draft.indexOf('scripts/draft-route.ts" approach');
		const comprehension = draft.search(
			/scripts\/draft-route\.ts" comprehension /,
		);
		const readiness = draft.search(/scripts\/draft-route\.ts" readiness /);
		const verify = draft.indexOf(
			'scripts/verify-change.ts" openspec/changes/<changeName>',
		);
		expect(approach).toBeGreaterThan(-1);
		expect(comprehension).toBeGreaterThan(approach);
		expect(readiness).toBeGreaterThan(comprehension);
		expect(verify).toBeGreaterThan(readiness);

		const explainBackAt = draft.search(
			/^\d+[a-z]?\.\s+\*\*[^\n]*explain[- ]back[^\n]*/im,
		);
		const readinessAt = draft.search(/^7c\.\s+\*\*/m);
		const verifyAt = draft.search(/^8\.\s+\*\*/m);
		expect(readinessAt).toBeGreaterThan(explainBackAt);
		expect(verifyAt).toBeGreaterThan(readinessAt);
	});

	test("order of gates: explain-back proceeds to the readiness step and not to verification", () => {
		const step = explainBackStep();
		expect(step).toMatch(/continue to step 7c/i);
		expect(step).not.toMatch(/continue to step 8/i);
	});

	test("order of gates: readiness runs only after explain-back proceeds and continues to verification on proceed or skip", () => {
		const step = readinessStep();
		expect(step).toMatch(/after explain-back[^.]*proceed/i);
		expect(step).toMatch(/continue to step 8/i);
		expect(step).toMatch(
			/not[ _-]?ready[^.]*(does not|never)[^.]*(step 8|verification)/i,
		);
	});

	test("an explain-back escalation never reaches the readiness check", () => {
		const routing = routeComprehension(
			parseExplainBackVerdict(
				JSON.stringify({
					verdict: "gaps",
					restatement: "partial",
					gaps: [{ question: "which queue", file: "src/worker.ts" }],
					contradiction: null,
				}),
			),
			2,
		);
		expect(routing.action).toBe("escalate");
		expect(routing.stop).toBe(EXPLAIN_BACK_STOP_ID);
		expect(readinessStep()).toMatch(/after explain-back[^.]*proceed/i);
	});
});

describe("readiness reviewer", () => {
	test("the reviewer is asked one question about the change, never the ticket", () => {
		const text = plain(agentText());
		expect(text).toMatch(
			/could an implementer succeed on the first pass from this change alone/i,
		);
		expect(text).toMatch(/(never|not)[^.]*ticket/i);
		expect(text).toMatch(/(never|not)[^.]*(style|naming)/i);
	});

	test("the verdict schema has no item kind for style, naming, or the merit of the ticket", () => {
		for (const kind of ["style", "naming", "ticket_merit", "ticket"]) {
			expect(() =>
				parse(notReady([{ kind, where: "a/b.ts", detail: "d" }])),
			).toThrow();
		}
	});

	test("reviewer runs on the frontier tier and is read-only", () => {
		const text = agentText();
		expect(text).toMatch(/^---[\s\S]*name: first-pass-reviewer[\s\S]*---/);
		expect(text).toMatch(
			/^---[\s\S]*model: opus[\s\S]*tools: Read, Grep, Glob/,
		);
		expect(text).toMatch(/^tools: Read, Grep, Glob$/m);
		expect(readinessStep()).toContain(
			"Otherwise dispatch one first-pass-reviewer as reference/first-pass-readiness.md describes",
		);
		const step = readinessProcedure();
		expect(step).toContain(AGENT_NAME);
		expect(step).toMatch(/resolve[^.]*frontier/i);
		expect(step).toContain("exact available model");
		expect(step).toMatch(/Read, Grep, Glob/);
	});

	test("the agent file states the four definitions", () => {
		const text = plain(agentText());
		expect(text).toMatch(/lacks a WHEN or a THEN/i);
		expect(text).toMatch(/no outcome a test could observe/i);
		expect(text).toMatch(/live model or a person/i);
		expect(text).toMatch(/neither present nor marked new/i);
		expect(text).toMatch(/described only in words/i);
		expect(text).toMatch(/identifier an implementer would type/i);
		for (const subject of [
			"function",
			"type",
			"command mode",
			"exit code",
			"configuration key",
			"file format",
			"stop id",
		]) {
			expect(text).toContain(subject);
		}
		expect(text).toMatch(/proves a scenario the specs do not contain/i);
		expect(text).toMatch(/scenario with no matching task/i);
		expect(text).toMatch(
			/path or interface (that is )?different from the one the design names/i,
		);
	});

	test("the agent file defines no other not-ready cause", () => {
		expect(plain(agentText())).toMatch(
			/no other|these four|only these|four (findings|definitions|causes)/i,
		);
	});

	test("an existing path inside an ignored worktree is found because presence is decided by a Read, never Glob or Grep", () => {
		const text = plain(agentText());
		expect(text).toMatch(/successful Read of the exact path/i);
		expect(text).toMatch(/(never|not)[^.]*(Glob|Grep)[^.]*presen(t|ce)/i);
		expect(text).toMatch(/ignored/i);
		expect(text).toMatch(/repository root/i);
	});

	test("the agent file states the checked-path rule", () => {
		const text = plain(agentText());
		expect(text).toMatch(/backticks/i);
		expect(text).toMatch(/repository-relative/i);
		expect(text).toMatch(/at least one slash/i);
		expect(text).toMatch(extensionList);
		expect(text).toMatch(/angle bracket/i);
	});

	test("a placeholder path is never reported as missing", () => {
		const text = plain(agentText());
		expect(text).toMatch(/angle bracket/i);
		expect(text).toMatch(/(never|not)[^.]*(report|check)/i);
		expect(text).toContain("openspec/changes/<change>/proposal.md");
	});

	test("a scratch path or bare filename is never reported as missing", () => {
		const text = plain(agentText());
		expect(text).toContain(".review/");
		expect(text).toContain(".delivery/");
		expect(text).toContain("skipped-workers.json");
		expect(text).toMatch(/bare filename/i);
		expect(text).toMatch(/(never|not)[^.]*(report|check)/i);
	});

	test("a denied or failed read of an existing path is reported as a missing file item", () => {
		const text = plain(agentText());
		expect(text).toMatch(
			/(denied|failed|fails)[^.]*missing[_ ]file|missing[_ ]file[^.]*(denied|failed|fails)/i,
		);
		expect(text).toMatch(/could not be read/i);
		expect(text).toMatch(/no other (item )?kind/i);
		const parsed = parse(notReady([unreadableFile]));
		expect(parsed.verdict).toBe("not_ready");
		expect(parsed.items[0]?.kind).toBe("missing_file");
	});

	test("a path marked new is never read and is not reported as missing", () => {
		const text = plain(agentText());
		expect(text).toContain("(new)");
		expect(text).toMatch(/Impact/);
		expect(text).toContain("design.md");
		expect(text).toMatch(
			/marked new[^.]*(never|not)[^.]*read|(never|not) read[^.]*marked new/i,
		);
	});
});

describe("readiness routing of not ready verdicts", () => {
	test.each(everyKind.map((item) => [item.kind, item] as const))(
		"each finding kind routes to a revision: %s",
		(_kind, item) => {
			const routing = routeReadiness(parse(notReady([item])), 1);
			expect(routing.action).toBe("revise");
			expect(routing.action).not.toBe("proceed");
			expect(routing.items).toEqual([item]);
			expect(routing.reason).toContain(item.detail);
			expect(routing.stop).toBeUndefined();
		},
	);

	test("a verdict can carry several items and the revise reason names both", () => {
		const parsed = parse(notReady([untestable, missingFile]));
		expect(parsed.items).toHaveLength(2);
		const routing = routeReadiness(parsed, 1);
		expect(routing.action).toBe("revise");
		expect(routing.items).toEqual([untestable, missingFile]);
		expect(routing.reason).toContain(untestable.detail);
		expect(routing.reason).toContain(missingFile.detail);
	});

	test("first not ready verdict triggers one revision, reports each item, and the command exits 0", () => {
		const result = runRoute(JSON.stringify(notReady([untestable])), "1");
		expect(result.exitCode).toBe(0);
		const printed = JSON.parse(result.stdout);
		expect(printed.action).toBe("revise");
		expect(printed.reason).toContain(untestable.detail);
		const step = readinessProcedure();
		expect(step).toMatch(/each (reported )?item/i);
		for (const action of ["proceed", "revise", "escalate"]) {
			expect(step).toContain(action);
		}
	});

	test("revision regenerates the task list before the second attempt and keeps the same isolated inputs", () => {
		const step = readinessProcedure();
		expect(step).toContain("generate-tasks.ts");
		expect(step).toMatch(/regenerat/i);
		expect(step).toMatch(/(never|do not)[^.]*(by hand|hand-(edit|writ))/i);
		expect(step).toMatch(/attempt 2/);
		expect(step).toMatch(/same isolated inputs/i);
		expect(routeReadiness(parse(notReady()), 1).action).toBe("revise");
		expect(routeReadiness(parse(notReady()), 2).action).toBe("escalate");
	});
});

describe("readiness escalation", () => {
	test("second not ready verdict escalates to a person with the unready-change stop naming each item", () => {
		const routing = routeReadiness(
			parse(notReady([untestable, missingFile])),
			2,
		);
		expect(routing.action).toBe("escalate");
		expect(routing.stop).toBe(STOP_ID);
		expect(routing.items).toEqual([untestable, missingFile]);
		expect(routing.reason).toContain(untestable.detail);
		expect(routing.reason).toContain(missingFile.detail);
	});

	test("the command exits 3 on the second not ready verdict and prints the stop id and the items", () => {
		const input = JSON.stringify(notReady([taskContradiction]));
		expect(runRoute(input, "1").exitCode).toBe(0);
		const second = runRoute(input, "2");
		expect(second.exitCode).toBe(3);
		const printed = JSON.parse(second.stdout);
		expect(printed.action).toBe("escalate");
		expect(printed.stop).toBe(STOP_ID);
		expect(printed.reason).toContain(taskContradiction.detail);
	});

	test("the draft step posts one note on escalation, stops with unready-change, and does not verify, commit, or post spec-ready", () => {
		const step = readinessProcedure();
		expect(step).toContain(STOP_ID);
		expect(step).toMatch(/exit 3/i);
		expect(step).toMatch(/one (provider )?note/i);
		expect(step).toMatch(/(do not|never|not)[^.]*verify/i);
		expect(step).toContain("commit");
		expect(step).toContain("spec-ready");
	});

	test("an escalation stop id differs from the explain-back stop and the draft skill uses each for its own check", () => {
		expect(STOP_ID).not.toBe(EXPLAIN_BACK_STOP_ID);
		expect(readinessStep()).toContain(STOP_ID);
		expect(explainBackStep()).toContain(EXPLAIN_BACK_STOP_ID);
	});
});

describe("readiness proceeds and bounds", () => {
	test("a ready verdict proceeds on attempt 1 and on attempt 2 after a revision", () => {
		for (const attempt of [1, 2]) {
			const routing = routeReadiness(parse(verdict({})), attempt);
			expect(routing.action).toBe("proceed");
			expect(routing.items).toEqual([]);
			expect(routing.stop).toBeUndefined();
		}
		for (const attempt of ["1", "2"]) {
			const result = runRoute(JSON.stringify(verdict({})), attempt);
			expect(result.exitCode).toBe(0);
			expect(JSON.parse(result.stdout).action).toBe("proceed");
		}
	});

	test("attempt out of bounds is refused and routes nothing", () => {
		for (const attempt of [0, 3, -1, 1.5, Number.NaN]) {
			expect(() => routeReadiness(parse(verdict({})), attempt)).toThrow();
		}
		for (const attempt of ["0", "3", "abc"]) {
			const result = runRoute(JSON.stringify(verdict({})), attempt);
			expect(result.exitCode).toBe(1);
			expect(result.stdout).toBe("");
		}
	});
});

describe("readiness low complexity skip", () => {
	test("low complexity skips and records the skip under the new worker and skip id", () => {
		const step = readinessStep();
		expect(step).toMatch(/complexitySignal[^.]*low/i);
		expect(step).toMatch(/(do not|never|no)[^.]*dispatch/i);
		expect(step).toContain(AGENT_NAME);
		expect(step).toContain(SKIP_ID);
		expect(step).toContain("skipped-workers.json");
		expect(step).toContain("record-skip.ts");
		expect(step).toContain("routing-scorecard.ts");
		expect(step).toMatch(/continue to step 8/i);
	});

	test("medium and high complexity are never skipped", () => {
		const step = readinessStep();
		expect(step).toMatch(/no other (condition|reason)|only when[^.]*low/i);
		expect(step).toMatch(/otherwise[^.]*dispatch/i);
	});

	test("worker name does not collide with readiness-lens and a skip recorded for the new name is accepted", async () => {
		expect(SKIPPED_WORKERS).toContain(AGENT_NAME);
		expect(SKIPPED_WORKERS).toContain("readiness-lens");
		expect(AGENT_NAME).not.toBe("readiness-lens");

		const root = mkdtempSync(join(tmpdir(), "readiness-skip-"));
		tempRoots.push(root);
		const paths = await persistSkipBatch(root, "DS-2", {
			skipId: "first-pass-reviewer-DS-2",
			worker: AGENT_NAME,
			reason: "Feasibility rated the work low complexity.",
		});
		expect(paths).toHaveLength(1);
		expect(readFileSync(paths[0] as string, "utf8")).toContain(
			`"worker": "${AGENT_NAME}"`,
		);
	});

	test("an already recorded skip id is refused by the store and the draft step continues without a different id", async () => {
		const root = mkdtempSync(join(tmpdir(), "readiness-skip-"));
		tempRoots.push(root);
		const skip = {
			skipId: "first-pass-reviewer-DS-2",
			worker: AGENT_NAME,
			reason: "Feasibility rated the work low complexity.",
		};
		await persistSkipBatch(root, "DS-2", skip);
		await expect(persistSkipBatch(root, "DS-2", skip)).rejects.toThrow(
			"skip id already recorded: first-pass-reviewer-DS-2",
		);

		expect(readinessStep()).toContain(
			"If persisting fails, read reference/readiness-skip.md",
		);
		const step = readinessSkipRecovery();
		expect(step).toContain(`skip id already recorded: ${SKIP_ID}`);
		expect(step).toMatch(/exit(s)? 1/i);
		expect(step).toMatch(/already recorded[^.]*continue/i);
		expect(step).toMatch(/other persist failure[^.]*stop/i);
		expect(step).toMatch(
			/(never|do not)[^.]*(invent|use)[^.]*different skip id/i,
		);
	});
});

describe("readiness verdict fails closed", () => {
	test("a malformed verdict stops the command on every attempt and is never treated as a pass", () => {
		for (const attempt of ["1", "2"]) {
			for (const input of [
				"{not json",
				JSON.stringify({ verdict: "ready" }),
				JSON.stringify(verdict({ verdict: "unsure" })),
				JSON.stringify(verdict({ extra: 1 })),
			]) {
				const result = runRoute(input, attempt);
				expect(result.exitCode).toBe(1);
				expect(result.stdout).not.toContain("proceed");
			}
		}
	});

	test("a missing verdict stops the command and is never treated as a pass", () => {
		const missing = runRoute(
			join(import.meta.dir, "no-such-readiness-verdict.json"),
			"1",
		);
		expect(missing.exitCode).toBe(1);
		expect(missing.stdout).not.toContain("proceed");
		const empty = runRoute("", "1");
		expect(empty.exitCode).toBe(1);
		expect(empty.stdout).not.toContain("proceed");
	});

	test("the draft step stops on a malformed verdict with one note and never retries with a fresh agent", () => {
		const step = readinessProcedure();
		expect(step).toMatch(/exit 1/i);
		expect(step).toMatch(/malformed/i);
		expect(step).toMatch(/stop/i);
		expect(step).toMatch(/one (provider )?note[^.]*validator failure/i);
		expect(step).toMatch(/(do not|never)[^.]*(retry|re-dispatch)/i);
		expect(step).toMatch(/never[^.]*pass/i);
	});

	test("the parser throws on invalid JSON, a missing verdict, an unknown value, and an extra key", () => {
		expect(() => parseReadinessVerdict("{not json")).toThrow("valid JSON");
		const { verdict: _omitted, ...withoutVerdict } = verdict({});
		expect(() => parse(withoutVerdict)).toThrow();
		expect(() => parse(verdict({ verdict: "unsure" }))).toThrow();
		expect(() => parse(verdict({ extra: 1 }))).toThrow();
		expect(() => parse(notReady([{ ...untestable, extra: "nope" }]))).toThrow();
	});
});

describe("readiness verdict contradictions and empties", () => {
	test("a ready verdict with items is refused and the command stops", () => {
		expect(() => parse(verdict({ items: [untestable] }))).toThrow();
		const input = JSON.stringify(verdict({ items: [untestable] }));
		expect(runRoute(input, "1").exitCode).toBe(1);
	});

	test("a not ready verdict with no items is refused and the command stops", () => {
		expect(() => parse(notReady([]))).toThrow();
		expect(runRoute(JSON.stringify(notReady([])), "1").exitCode).toBe(1);
	});

	test("an empty reasoning is refused and the command stops", () => {
		expect(() => parse(verdict({ reasoning: "" }))).toThrow();
		expect(
			runRoute(JSON.stringify(verdict({ reasoning: "" })), "1").exitCode,
		).toBe(1);
	});

	test("an unknown item kind is refused and the command stops", () => {
		const input = JSON.stringify(
			notReady([{ kind: "vague_wording", where: "a/b.ts", detail: "d" }]),
		);
		expect(() =>
			parse(
				notReady([{ kind: "vague_wording", where: "a/b.ts", detail: "d" }]),
			),
		).toThrow();
		expect(runRoute(input, "1").exitCode).toBe(1);
	});

	test("an item needs a kind, a location, and a detail", () => {
		expect(() => parse(notReady([{ ...untestable, where: "" }]))).toThrow();
		expect(() => parse(notReady([{ ...untestable, detail: "" }]))).toThrow();
		const { where: _where, ...withoutWhere } = untestable;
		expect(() => parse(notReady([withoutWhere]))).toThrow();
		const { kind: _kind, ...withoutKind } = untestable;
		expect(() => parse(notReady([withoutKind]))).toThrow();
	});

	test("valid verdicts are accepted and route by their value", () => {
		expect(parse(verdict({})).verdict).toBe("ready");
		const parsed = parse(notReady(everyKind));
		expect(parsed.verdict).toBe("not_ready");
		expect(parsed.items.map((item) => item.kind)).toEqual([
			"untestable_scenario",
			"missing_file",
			"unnamed_interface",
			"task_contradiction",
		]);
		expect(routeReadiness(parse(verdict({})), 1).action).toBe("proceed");
		expect(routeReadiness(parsed, 1).action).toBe("revise");
	});
});

describe("readiness reviewer isolation and checked paths", () => {
	test("reader isolation: the dispatch lists only the change directory and the checked paths and excludes the work item, grooming decisions, draft scratch, and change metadata", () => {
		const step = readinessProcedure();
		expect(step).toContain("openspec/changes/<changeName>/");
		expect(step).toContain("tasks.md");
		expect(step).toMatch(/only[^.]*change directory/i);
		expect(step).toMatch(/checked paths?/i);
		expect(step).toMatch(/never[^.]*work item/i);
		expect(step).toContain("decisions.md");
		expect(step).toContain(".review/draft-");
		expect(step).toContain(META_FILENAME);
	});

	test("the draft step lists the checked paths in the dispatch by the checked-path rule", () => {
		const step = readinessProcedure();
		expect(step).toMatch(/list[^.]*checked paths?[^.]*dispatch/i);
		expect(step).toMatch(/backticks/i);
		expect(step).toMatch(/at least one slash/i);
		expect(step).toMatch(extensionList);
		expect(step).toMatch(/angle bracket/i);
	});

	test("a placeholder path is not in the checked list", () => {
		expect(readinessProcedure()).toMatch(
			/angle bracket[^.]*(not|never)|(not|never)[^.]*angle bracket/i,
		);
	});

	test("a scratch path or bare filename is not in the checked list", () => {
		const rule = checkedPathParagraph();
		expect(rule).toMatch(
			/do not list a path that starts with \.review\/\s*,\s*\.delivery\/\s*,/i,
		);
		expect(rule).toContain(
			"a runtime scratch file, meaning any path whose last segment is skipped-workers.json",
		);
		expect(rule).toMatch(/bare filename/i);
	});
});

describe("unready change stop", () => {
	test("the constitution names unready-change and unsettled-comprehension as two distinct draft stops", () => {
		const stops = loadConstitution().document.stages.draft?.stops ?? [];
		expect(stops).toContain(STOP_ID);
		expect(stops).toContain(EXPLAIN_BACK_STOP_ID);
		expect(STOP_ID).not.toBe(EXPLAIN_BACK_STOP_ID);
	});

	test("the stop id the route escalates with is a declared draft stop", () => {
		const routing = routeReadiness(parse(notReady()), 2);
		expect(loadConstitution().document.stages.draft?.stops).toContain(
			routing.stop as string,
		);
	});
});

describe("contributor docs describe the readiness step", () => {
	const conventions = read("CONVENTIONS.md");
	const reference = read("../docs/reference.md");

	test("CONVENTIONS lists the first-pass reviewer as a read-only subagent and in the model policy", () => {
		const readOnly = conventions
			.split("\n")
			.find((line) => line.includes("**Read-only subagents.**"));
		expect(readOnly).toContain(AGENT_NAME);
		const policy = conventions
			.split("\n")
			.find((line) => line.includes("**Model choice.**"));
		expect(policy).toContain(AGENT_NAME);
	});

	test("the docs name the agent, the readiness route mode, the stop, and the low complexity skip", () => {
		for (const doc of [conventions, reference]) {
			const text = plain(doc);
			expect(text).toContain(AGENT_NAME);
			expect(text).toMatch(/readiness/i);
			expect(text).toContain(STOP_ID);
			expect(text).toMatch(/low complexity/i);
		}
		expect(reference).toContain("draft-route.ts readiness");
		expect(plain(reference)).toMatch(
			/explain-back[^.]*readiness|readiness[^.]*explain-back/i,
		);
		expect(plain(reference)).toMatch(/verif/i);
	});
});
