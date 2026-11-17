import { describe, expect, test } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { META_FILENAME } from "./change-meta";
import { routeComprehension } from "./draft-route";
import { loadConstitution } from "./sdlc-constitution";
import { parseExplainBackVerdict } from "./verdicts";

const ROOT = join(import.meta.dir, "..");
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");
const plain = (text: string) =>
	text.replace(/[*`\n]+/g, " ").replace(/\s+/g, " ");

const draft = read("../skills/draft/SKILL.md");
const STOP_ID = "unsettled-comprehension";
const ROUTE_SCRIPT = join(import.meta.dir, "draft-route.ts");

const gap = {
	question: "what does the usual retry limit mean here",
	file: "openspec/changes/example/design.md",
};
const secondGap = {
	question: "which queue does the worker read from",
	file: "src/worker.ts",
};
const contradiction =
	"the restatement says drafts skip review but the specs require it";

const verdict = (value: Record<string, unknown>) => ({
	verdict: "understood",
	restatement:
		"The change adds a check. Requirement one does X. The code does Y.",
	gaps: [],
	contradiction: null,
	...value,
});
const parse = (value: Record<string, unknown>) =>
	parseExplainBackVerdict(JSON.stringify(verdict(value)));

const gapsVerdict = (gaps = [gap]) =>
	parse({ verdict: "gaps", gaps, restatement: "partial restatement" });
const misreadVerdict = () => parse({ verdict: "misread", contradiction });

const runRoute = (input: string, attempt: string) => {
	const result = Bun.spawnSync(
		["bun", ROUTE_SCRIPT, "comprehension", input, attempt],
		{
			stdout: "pipe",
			stderr: "pipe",
		},
	);
	return { exitCode: result.exitCode, stdout: result.stdout.toString() };
};

const stepHeading = /^\d+[a-z]?\.\s+\*\*/m;
function explainBackStep(): string {
	const start = draft.search(
		/^\d+[a-z]?\.\s+\*\*[^\n]*explain[- ]back[^\n]*/im,
	);
	expect(start).toBeGreaterThan(-1);
	const rest = draft.slice(start + 1);
	const end = rest.search(stepHeading);
	return plain(end === -1 ? rest : rest.slice(0, end));
}

function explainBackAgent(): { name: string; text: string } {
	const files = readdirSync(join(ROOT, "agents")).filter((file) =>
		/explain-back/.test(file),
	);
	expect(files).toHaveLength(1);
	const name = (files[0] as string).replace(/\.md$/, "");
	return { name, text: read(`agents/${name}.md`) };
}

describe("explain-back placement in draft", () => {
	test("approach challenge runs before explain-back, readiness runs after explain-back, and verify only after readiness proceeds", () => {
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

		const heading = draft.search(
			/^\d+[a-z]?\.\s+\*\*[^\n]*explain[- ]back[^\n]*/im,
		);
		expect(heading).toBeGreaterThan(approach);
		const approachStep = plain(draft.slice(approach, heading));
		expect(approachStep).not.toMatch(/continue to step 8/i);
		expect(approachStep).not.toMatch(/verify-change/);
		expect(explainBackStep()).toMatch(/proceed/);
	});

	test("explain-back still runs before verify when the approach challenge was skipped for low complexity", () => {
		const step = explainBackStep();
		expect(step).toMatch(/every draft/i);
		expect(step).toMatch(/skipped|low complexity|complexitySignal is low/i);
		expect(step).not.toMatch(/skipped-workers/);
		expect(step).not.toMatch(/skip this step/i);
		expect(
			draft.search(/scripts\/draft-route\.ts" comprehension /),
		).toBeLessThan(
			draft.indexOf('scripts/verify-change.ts" openspec/changes/<changeName>'),
		);
	});
});

describe("explain-back gaps", () => {
	test("a spec relying on grilling-only context reports each gap and does not reach verification", () => {
		const routing = routeComprehension(gapsVerdict([gap, secondGap]), 1);
		expect(routing.action).toBe("revise");
		expect(routing.action).not.toBe("proceed");
		expect(routing.gaps).toEqual([gap, secondGap]);
		expect(routing.reason).toContain(gap.question);
		expect(routing.reason).toContain(secondGap.question);

		const step = explainBackStep();
		expect(step).toMatch(/each gap/i);
		for (const action of ["proceed", "revise", "escalate"]) {
			expect(step).toContain(action);
		}
	});

	test("a clean restatement routes to proceed with no gaps and no stop", () => {
		const routing = routeComprehension(parse({}), 1);
		expect(routing.action).toBe("proceed");
		expect(routing.gaps).toEqual([]);
		expect(routing.stop).toBeUndefined();
	});

	test("the command exits 0 on a first failing verdict and names the revise action", () => {
		const result = runRoute(
			JSON.stringify(verdict({ verdict: "gaps", gaps: [gap] })),
			"1",
		);
		expect(result.exitCode).toBe(0);
		expect(JSON.parse(result.stdout).action).toBe("revise");
	});
});

describe("explain-back escalation", () => {
	test("a second failure escalates with the unsettled-comprehension stop and a note naming the gaps", () => {
		const routing = routeComprehension(gapsVerdict([gap, secondGap]), 2);
		expect(routing.action).toBe("escalate");
		expect(routing.stop).toBe(STOP_ID);
		expect(routing.gaps).toEqual([gap, secondGap]);
		expect(routing.reason).toContain(gap.question);
		expect(routing.reason).toContain(secondGap.question);
	});

	test("a second misread also escalates with the unsettled-comprehension stop", () => {
		const routing = routeComprehension(misreadVerdict(), 2);
		expect(routing.action).toBe("escalate");
		expect(routing.stop).toBe(STOP_ID);
		expect(routing.reason).toContain(contradiction);
	});

	test("the command exits 3 on the second failure and prints the stop id and the gaps", () => {
		const input = JSON.stringify(verdict({ verdict: "gaps", gaps: [gap] }));
		expect(runRoute(input, "1").exitCode).toBe(0);
		const second = runRoute(input, "2");
		expect(second.exitCode).toBe(3);
		const printed = JSON.parse(second.stdout);
		expect(printed.action).toBe("escalate");
		expect(printed.stop).toBe(STOP_ID);
		expect(printed.reason).toContain(gap.question);
	});

	test("an attempt outside 1 to 2 is refused", () => {
		expect(() => routeComprehension(parse({}), 0)).toThrow();
		expect(() => routeComprehension(parse({}), 3)).toThrow();
		expect(runRoute(JSON.stringify(verdict({})), "3").exitCode).toBe(1);
	});

	test("the draft step posts one note on escalation and stops on exit 3", () => {
		const step = explainBackStep();
		expect(step).toContain(STOP_ID);
		expect(step).toMatch(/exit 3/i);
		expect(step).toMatch(/one (provider )?note/i);
	});
});

describe("explain-back verdict fails closed", () => {
	test("a missing verdict stops the command and is never treated as a pass", () => {
		const missing = runRoute(
			join(import.meta.dir, "no-such-verdict.json"),
			"1",
		);
		expect(missing.exitCode).toBe(1);
		expect(missing.stdout).not.toContain("proceed");
		const empty = runRoute("", "1");
		expect(empty.exitCode).toBe(1);
		expect(empty.stdout).not.toContain("proceed");
	});

	test("a malformed verdict stops the command on every attempt and is never treated as a pass", () => {
		for (const attempt of ["1", "2"]) {
			for (const input of [
				"{not json",
				JSON.stringify({ verdict: "understood" }),
				JSON.stringify(verdict({ verdict: "unsure" })),
				JSON.stringify(verdict({ extra: 1 })),
			]) {
				const result = runRoute(input, attempt);
				expect(result.exitCode).toBe(1);
				expect(result.stdout).not.toContain("proceed");
			}
		}
	});

	test("the parser throws on invalid JSON, a missing verdict, an unknown value, and an extra key", () => {
		expect(() => parseExplainBackVerdict("{not json")).toThrow("valid JSON");
		const { verdict: _omitted, ...withoutVerdict } = verdict({});
		expect(() =>
			parseExplainBackVerdict(JSON.stringify(withoutVerdict)),
		).toThrow();
		expect(() => parse({ verdict: "unsure" })).toThrow();
		expect(() => parse({ extra: 1 })).toThrow();
	});

	test("the draft step stops on a malformed verdict and never retries with a fresh agent", () => {
		const step = explainBackStep();
		expect(step).toMatch(/malformed/i);
		expect(step).toMatch(/stop/i);
		expect(step).toMatch(/(do not|never)[^.]*(retry|re-dispatch)/i);
	});
});

describe("explain-back verdict contradictions and empties", () => {
	test("understood, gaps, and misread verdicts with their required content parse", () => {
		expect(parse({}).verdict).toBe("understood");
		expect(gapsVerdict().verdict).toBe("gaps");
		expect(misreadVerdict().verdict).toBe("misread");
	});

	test("understood with an empty restatement is refused and the command stops", () => {
		expect(() => parse({ restatement: "" })).toThrow();
		const input = JSON.stringify(verdict({ restatement: "" }));
		expect(runRoute(input, "1").exitCode).toBe(1);
	});

	test("gaps with no gaps listed is refused and the command stops", () => {
		expect(() => parse({ verdict: "gaps", gaps: [] })).toThrow();
		const input = JSON.stringify(verdict({ verdict: "gaps", gaps: [] }));
		expect(runRoute(input, "1").exitCode).toBe(1);
	});

	test("misread without a contradiction is refused and the command stops", () => {
		expect(() => parse({ verdict: "misread", contradiction: null })).toThrow();
		expect(() => parse({ verdict: "misread", contradiction: "" })).toThrow();
		const input = JSON.stringify(verdict({ verdict: "misread" }));
		expect(runRoute(input, "1").exitCode).toBe(1);
	});

	test("a gap needs both a question and the file that should have answered it", () => {
		expect(() =>
			parse({ verdict: "gaps", gaps: [{ question: "", file: gap.file }] }),
		).toThrow();
		expect(() =>
			parse({ verdict: "gaps", gaps: [{ question: gap.question, file: "" }] }),
		).toThrow();
		expect(() =>
			parse({ verdict: "gaps", gaps: [{ question: gap.question }] }),
		).toThrow();
	});
});

describe("explain-back misread", () => {
	test("a misread on the first attempt requires one revision and never proceeds", () => {
		const routing = routeComprehension(misreadVerdict(), 1);
		expect(routing.action).toBe("revise");
		expect(routing.reason).toContain(contradiction);
		const input = JSON.stringify(
			verdict({ verdict: "misread", contradiction }),
		);
		const result = runRoute(input, "1");
		expect(result.exitCode).toBe(0);
		expect(JSON.parse(result.stdout).action).toBe("revise");
	});

	test("the draft command compares the restatement to the change files and the work item never goes to the reader", () => {
		const step = explainBackStep();
		expect(step).toMatch(/misread/i);
		expect(step).toMatch(/compar/i);
		expect(step).toMatch(
			/restatement[^.]*contradict|contradict[^.]*restatement/i,
		);
		expect(step).toMatch(/never[^.]*work item/i);
	});
});

describe("explain-back reader isolation", () => {
	test("the dispatch lists only the change directory and named referenced paths and excludes the work item, grooming decisions, and change metadata", () => {
		const step = explainBackStep();
		expect(step).toContain("openspec/changes/<changeName>/");
		expect(step).toMatch(/only[^.]*change directory/i);
		expect(step).toMatch(/referenced/i);
		expect(step).toMatch(/never[^.]*work item/i);
		expect(step).toContain("decisions.md");
		expect(step).toContain(".review/draft-");
		expect(step).toContain(META_FILENAME);
	});

	test("the reader is a standard-tier read-only agent for which a denied path read is a gap, not evidence", () => {
		const { name, text } = explainBackAgent();
		expect(text).toMatch(
			/^---[\s\S]*model: sonnet[\s\S]*tools: Read, Grep, Glob/,
		);
		expect(plain(text)).toMatch(/denied[^.]*gap/i);
		const step = explainBackStep();
		expect(step).toContain(name);
		expect(step).toMatch(/standard/i);
		expect(step).toMatch(/denied[^.]*gap/i);
	});
});

describe("explain-back revision", () => {
	test("a first failure revises once, regenerates tasks, and keeps the same isolated inputs for attempt 2", () => {
		expect(routeComprehension(gapsVerdict(), 1).action).toBe("revise");
		expect(routeComprehension(gapsVerdict(), 2).action).toBe("escalate");
		expect(routeComprehension(parse({}), 2).action).toBe("proceed");

		const step = explainBackStep();
		expect(step).toContain("generate-tasks.ts");
		expect(step).toMatch(/attempt 2/);
		expect(step).toMatch(/same isolated inputs/i);
	});
});

describe("unsettled comprehension stop", () => {
	test("the constitution draft stops include the unsettled-comprehension stop id", () => {
		const stops = loadConstitution().document.stages.draft?.stops;
		expect(stops).toContain(STOP_ID);
	});

	test("the stop id the route escalates with is a declared draft stop", () => {
		const routing = routeComprehension(gapsVerdict(), 2);
		expect(loadConstitution().document.stages.draft?.stops).toContain(
			routing.stop as string,
		);
	});
});
