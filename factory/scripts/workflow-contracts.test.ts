import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..");
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");
const plain = (text: string) =>
	text.replace(/[*`\n]+/g, " ").replace(/\s+/g, " ");

const testWriter = read("agents/test-writer.md");
const holdoutReviewer = read("agents/holdout-reviewer.md");
const groomWriter = read("agents/groom-writer.md");
const ticketAssessor = read("agents/ticket-assessor.md");
const draft = read("../skills/draft/SKILL.md");
const execute = read("../skills/execute/SKILL.md");
const addressComments = read("../skills/address-comments/SKILL.md");
const groom = read("../skills/groom/SKILL.md");
const runtime = read("RUNTIME.md");

describe("test epistemology", () => {
	test("writer and holdout require public behaviour and independent expectations", () => {
		for (const prompt of [testWriter, holdoutReviewer]) {
			expect(prompt).toMatch(/public (interface|contract)/i);
			expect(prompt).toMatch(/independent expected value/i);
			expect(prompt).toMatch(/mock only (at )?system boundaries/i);
			expect(prompt).toMatch(/internal refactor/i);
		}
	});

	test("writer and holdout reject tautological tests", () => {
		for (const prompt of [testWriter, holdoutReviewer]) {
			expect(prompt).toMatch(/tautolog/i);
			expect(prompt).toMatch(/implementation logic/i);
		}
	});
});

describe("approval-gated design", () => {
	test("draft requires seam approval before authoring", () => {
		const contract = plain(draft);
		expect(contract).toContain("Test seam checkpoint");
		expect(contract).toMatch(/explicit operator approval/i);
		expect(contract).toMatch(/what each seam catches and misses/i);
		expect(contract).toMatch(/existing.*highest.*fewest/i);
		expect(draft.indexOf("Test seam checkpoint")).toBeLessThan(
			draft.indexOf("Author the OpenSpec change"),
		);
	});

	test("high complexity records a sketch and rejected alternative", () => {
		const contract = plain(draft);
		expect(contract).toMatch(/complexitySignal.*high/i);
		expect(contract).toMatch(/usage sketch/i);
		expect(contract).toMatch(/type or signature sketch/i);
		expect(contract).toMatch(/rejected alternative/i);
	});
});

describe("durable grooming", () => {
	test("groom asks only frontier questions and separates facts from decisions", () => {
		expect(groom).toMatch(/question frontier/i);
		expect(groom).toMatch(/prerequisites.*settled/i);
		expect(groom).toMatch(/facts.*discover/i);
		expect(groom).toMatch(/decisions.*ask/i);
	});

	test("ticket prompts prefer contracts over stale source coordinates", () => {
		for (const prompt of [groomWriter, ticketAssessor]) {
			expect(prompt).toMatch(/current behaviour/i);
			expect(prompt).toMatch(/desired behaviour/i);
			expect(prompt).toMatch(/stale.*file path|file paths.*stale/i);
			expect(prompt).toMatch(/out of scope/i);
		}
	});
});

describe("small-context ticket scope", () => {
	test("groom requires atomic but complete vertical slices", () => {
		const contract = plain(groom);
		expect(contract).toMatch(/small-context budget/i);
		expect(contract).toMatch(/one user-visible outcome/i);
		expect(contract).toMatch(/one primary public contract or behaviour/i);
		expect(contract).toMatch(/one to three acceptance criteria/i);
		expect(contract).toMatch(/vertically complete/i);
		expect(contract).toMatch(/frontend-only.*backend-only.*test-only/i);
	});

	test("writer cannot turn a broad ticket into a technical-layer microticket", () => {
		const contract = plain(groomWriter);
		expect(contract).toMatch(/small-context session/i);
		expect(contract).toMatch(/independently deployable.*and.*outcome/i);
		expect(contract).toMatch(/vertically complete/i);
		expect(contract).toMatch(/at most three/i);
	});

	test("draft fails closed on an oversized ticket and returns a concrete split", () => {
		const assessor = plain(ticketAssessor);
		const draftContract = plain(draft);
		expect(assessor).toMatch(/scopeFit: "too_large"/i);
		expect(assessor).toMatch(/splitRecommendation/i);
		expect(assessor).toMatch(/small-context session/i);
		expect(draftContract).toMatch(
			/No spec is authored for an oversized ticket/i,
		);
		expect(draftContract).toMatch(/SPLIT_REQUIRED/i);
	});
});

describe("bounded recovery and replay safety", () => {
	test("execute reconciles durable state before writing", () => {
		expect(execute).toContain("Re-entry reconciliation");
		for (const artifact of [
			"existing MR",
			"test files",
			"gate artifacts",
			"commits",
			"dirty worktree",
		]) {
			expect(execute).toContain(artifact);
		}
		expect(execute).toMatch(/never (rewrite|replace) already-proven tests/i);
		expect(execute).toMatch(/never open a duplicate MR/i);
	});

	test("repeated failures force a premise check before a third fix", () => {
		for (const skill of [execute, addressComments]) {
			const contract = plain(skill);
			expect(contract).toMatch(/two failures.*same assumption/i);
			expect(contract).toMatch(/state the premise/i);
			expect(contract).toMatch(/one discriminating observation/i);
			expect(contract).toMatch(/no third fix/i);
		}
	});

	test("shadow routing records a cheaper tier without changing live dispatch", () => {
		expect(execute).toContain("select-model.ts");
		expect(execute).toContain("shadow-route.ts");
		expect(execute).toContain("task-profile-controller");
		expect(execute).toContain("record-routing.ts");
		expect(execute).toContain(".delivery/routing/");
		expect(execute).toContain("90 percent");
		expect(execute).toContain("Dispatch still uses the live `select-model.ts`");
		expect(execute).toContain("model-catalogue.ts");
		expect(plain(execute)).toContain("never this run's worker");
		expect(draft).toContain("do not change the model used to author");
		expect(draft).toContain("task-profile-controller");
		expect(addressComments).toContain("semantic standard route");
		expect(addressComments).toContain("task-profile-controller");
	});

	test("the profile controller is frontier-level and read-only", () => {
		const controller = read("agents/task-profile-controller.md");
		expect(controller).toMatch(
			/^---[\s\S]*model: opus[\s\S]*tools: Read, Grep, Glob/,
		);
		expect(controller).toContain("frontier controller");
		expect(controller).toContain("portable fallback");
		expect(controller).toContain("You do not implement");
		expect(controller).toContain("TaskProfileInput");
		expect(controller).toContain("**no** `Bash`");
	});

	test("factory dispatch resolves exact models from the runtime inventory", () => {
		expect(runtime).toContain("Runtime model inventory");
		expect(runtime).toContain("model-inventory.json");
		expect(runtime).toContain("Muse Wonder");
		expect(runtime).toContain("evaluation-only");
		expect(execute).toContain("exact available model");
		expect(draft).toContain("exact available model");
		expect(addressComments).toContain("exact available model");
	});

	test("record-routing persist always supplies an explicit outcome file", () => {
		expect(draft).toContain("author-outcome.json");
		expect(execute).toContain("implement-outcome.json");
		expect(execute).toContain("review-outcome.json");
		expect(addressComments).toContain("classify-outcome.json");
		expect(addressComments).toContain("review-outcome.json");
		expect(runtime).toMatch(/explicit outcome/);
	});

	test("pressure cannot bypass deterministic or human gates", () => {
		expect(execute).toMatch(/time pressure.*never.*skip.*red gate/i);
		expect(draft).toMatch(/sponsor|authority/i);
		expect(draft).toMatch(/failed readiness.*proceed/i);
		expect(addressComments).toMatch(/sunk cost|nitpick/i);
		expect(addressComments).toMatch(/never.*silently/i);
	});
});
