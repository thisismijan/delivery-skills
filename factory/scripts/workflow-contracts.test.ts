import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { FAST_SAFETY_FLOORS } from "./fast-dispatch";
import {
	invokeProvider,
	missingProvider,
	readForgeChange,
	readTrackerItem,
} from "./providers";
import {
	CONSTITUTION_CHECK_INVOCATION,
	CONSTITUTION_FREEZE_INVOCATION,
	CONSTITUTION_PREFLIGHT_INVOCATION,
	CONSTITUTION_REPORT_INVOCATION,
	CONSTITUTION_VERSION,
	loadConstitution,
} from "./sdlc-constitution";

const ROOT = join(import.meta.dir, "..");
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");
const plain = (text: string) =>
	text.replace(/[*`\n]+/g, " ").replace(/\s+/g, " ");

const testWriter = read("agents/test-writer.md");
const implementer = read("agents/implementer.md");
const implementerOpus = read("agents/implementer-opus.md");
const holdoutReviewer = read("agents/holdout-reviewer.md");
const groomWriter = read("agents/groom-writer.md");
const ticketAssessor = read("agents/ticket-assessor.md");
const draft = read("../skills/draft/SKILL.md");
const execute = read("../skills/execute/SKILL.md");
const addressComments = read("../skills/address-comments/SKILL.md");
const groom = read("../skills/groom/SKILL.md");
const delivery = read("../skills/delivery/SKILL.md");
const auto = read("../skills/delivery/workflows/auto.md");
const ledger = read("../skills/delivery/workflows/delivery-ledger.md");
const mrReview = read("../skills/mr-review/SKILL.md");
const runtime = read("RUNTIME.md");
const cursorAdapter = read("../adapters/cursor/README.md");
const claudeAdapter = read("../adapters/claude-code/README.md");
const claudeSettings = read("../adapters/claude-code/settings.json");

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

describe("smallest complete change", () => {
	test("both implementers share the reuse ladder and safety floor", () => {
		for (const prompt of [implementer, implementerOpus]) {
			expect(prompt).toContain("## Smallest complete change");
			expect(prompt).toMatch(
				/reuse.*existing helper, component, service, or pattern/i,
			);
			expect(prompt).toMatch(/platform or standard library/i);
			expect(prompt).toMatch(/already-installed dependency/i);
			expect(prompt).toMatch(/trust-boundary\s+validation/i);
			for (const heading of [
				"Files changed",
				"Reused",
				"Skipped",
				"Not checked",
				"Residual risks",
			]) {
				expect(prompt).toContain(`**${heading}:**`);
			}
		}
	});

	test("test and grooming workers reuse existing seams and report omissions", () => {
		expect(testWriter).toMatch(
			/reuse the narrowest existing public test seam/i,
		);
		expect(groomWriter).toMatch(/smallest complete change/i);
		for (const prompt of [testWriter, groomWriter]) {
			for (const heading of [
				"Reused",
				"Skipped",
				"Not checked",
				"Residual risks",
			]) {
				expect(prompt).toContain(`**${heading}:**`);
			}
		}
	});

	test("draft specifies the reuse ladder and execute keeps handoffs out of holdout", () => {
		const draftContract = plain(draft);
		expect(draftContract).toMatch(/Specify the smallest complete change/i);
		expect(draftContract).toMatch(
			/avoiding unnecessary work.*existing repository capability.*platform or standard library.*installed dependency.*smallest direct addition/i,
		);
		expect(execute).toContain("test-writer-handoff.md");
		expect(execute).toContain("implementer-handoff.md");
		expect(plain(execute)).toMatch(
			/never pass it.*implementation reasoning to the holdout reviewer/i,
		);
		expect(plain(execute)).toMatch(
			/Surface every material.*Skipped.*Not checked.*Residual risks/i,
		);
	});

	test("holdout and max review reject only materially unnecessary machinery", () => {
		const maxReview = read("../skills/code-review-max/SKILL.md");
		for (const prompt of [holdoutReviewer, maxReview]) {
			expect(prompt).toMatch(/concrete cost/i);
			expect(prompt).toMatch(/smallest complete fix/i);
			expect(prompt).toMatch(/validation.*security.*accessibility/i);
		}
		expect(holdoutReviewer).toMatch(
			/Do not fail.*merely because code could be shorter/i,
		);
		expect(maxReview).toMatch(/Drop "could be shorter"/i);
	});
});

describe("continuous delivery authorization", () => {
	test("single-step draft asks for seam approval while continuous mode does not", () => {
		const contract = plain(draft);
		expect(contract).toContain("Test seam decision");
		expect(contract).toMatch(/explicit operator approval/i);
		expect(contract).toMatch(
			/continuous-delivery: yes.*standing authorization.*Do not ask again/i,
		);
		expect(contract).toMatch(/what each seam catches and misses/i);
		expect(contract).toMatch(/existing.*highest.*fewest/i);
		expect(draft.indexOf("Test seam decision")).toBeLessThan(
			draft.indexOf("Author the OpenSpec change"),
		);
	});

	test("plan approval flows through build, review publication, and post-merge work", () => {
		for (const doc of [delivery, auto, ledger]) {
			expect(doc).toContain("continuous-delivery: yes");
		}
		expect(execute).toMatch(
			/continuous-delivery: yes.*without another checkbox/s,
		);
		expect(mrReview).toMatch(
			/continuous-delivery: yes.*standing publication authorization/s,
		);
		expect(auto).toMatch(/run retro without another checkpoint/i);
		expect(auto).toMatch(/Archive[\s\S]*continuous authorization/);
	});

	test("continuous authorization preserves merge, risk, and install boundaries", () => {
		expect(plain(auto)).toMatch(
			/not authorization to merge.*accept a release risk.*install an improvement candidate/i,
		);
		expect(plain(auto)).toMatch(/never supplies improvement approval/i);
		expect(delivery).toMatch(/never merge via the forge provider/i);
	});

	test("parallel workers use isolated worktrees and coordinator-owned state", () => {
		const contract = plain(auto);
		expect(contract).toMatch(/automatically fan out the entire ready wave/i);
		expect(contract).toMatch(/one detached git worktree per key/i);
		expect(contract).toMatch(/Start all workers before awaiting any one/i);
		expect(contract).toMatch(/coordinator remains the only writer/i);
		expect(auto).toContain("DELIVERY_WORKER_JOURNAL");
		expect(ledger).toContain("### Parallel worker journals");
		expect(ledger).toMatch(
			/worker must not search for or\s+mutate the run ledger/i,
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

describe("SDLC constitution", () => {
	test("live skills share the same constitution version and do not contradict it", () => {
		const live = loadConstitution();
		expect(live.document.version).toBe(CONSTITUTION_VERSION);
		expect(live.hash).toMatch(/^sha256:[0-9a-f]{64}$/);
		for (const doc of [
			delivery,
			auto,
			ledger,
			groom,
			draft,
			execute,
			addressComments,
			mrReview,
			read("../skills/code-review-max/SKILL.md"),
			runtime,
		]) {
			expect(doc).toContain("SDLC-CONSTITUTION.md");
			expect(doc).not.toMatch(/constitution is advisory/i);
			expect(doc).not.toMatch(/prose overrides? a failed/i);
		}
		expect(delivery).toMatch(/it wins/i);
		expect(read("../skills/delivery/SDLC-CONSTITUTION.md")).toContain(
			"this file wins",
		);
		expect(delivery).toContain(CONSTITUTION_PREFLIGHT_INVOCATION);
		expect(delivery).toContain(CONSTITUTION_FREEZE_INVOCATION);
		expect(delivery).toContain(CONSTITUTION_CHECK_INVOCATION);
		expect(delivery).toContain(CONSTITUTION_REPORT_INVOCATION);
		expect(auto).toContain("Frozen run contract");
		expect(ledger).toContain(".delivery/runs/<id>.run-contract.json");
		expect(runtime).toContain("sdlc-constitution.ts");
	});
});

describe("durable grooming", () => {
	test("groom asks only frontier questions and separates facts from decisions", () => {
		expect(groom).toMatch(/question frontier/i);
		expect(groom).toMatch(/prerequisites.*settled/i);
		expect(groom).toMatch(/facts.*discover/i);
		expect(groom).toMatch(/decisions.*ask/i);
		expect(groom).toMatch(/Human decision brief/i);
		expect(groom).toMatch(/two or more viable.*product or slicing/is);
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

describe("context-rich human decisions", () => {
	test("the conductor owns the canonical brief", () => {
		expect(delivery).toContain("## Human decision brief");
		expect(delivery).toContain("### DSA lens");
		expect(delivery).toContain("### System-design lens");
		expect(delivery).toContain("No material DSA difference");
		expect(delivery).toContain("No material system-design");
		expect(delivery).toMatch(/Never invent Big-O claims/i);
	});

	test("stage skills invoke the brief only when multiple paths are viable", () => {
		expect(draft).toMatch(
			/two or more seam sets are viable.*Human decision brief/is,
		);
		expect(draft).toMatch(/Do not invent differences/i);
		expect(mrReview).toMatch(/three choices:.*Human\s+decision brief/is);
		expect(mrReview).toMatch(/no material DSA or\s+system-design difference/i);
	});

	test("decision context never turns failed evidence into an option", () => {
		expect(delivery).toMatch(/failed gate never becomes an option/i);
		expect(auto).toMatch(/Contradictory or unattributable.*remains a stop/is);
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

	test("resume and execute escalate unattributable branch, gate, or dirty-tree evidence", () => {
		expect(plain(execute)).toMatch(/stop and escalate rather than guessing/i);
		expect(plain(delivery)).toMatch(/cannot be attributed/i);
		expect(plain(delivery)).toMatch(/never discard/i);
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
		expect(runtime).toContain("exact model identifiers");
		expect(runtime).toContain("evaluation-only");
		expect(execute).toContain("exact available model");
		expect(draft).toContain("exact available model");
		expect(addressComments).toContain("exact available model");
	});

	test("fast-model graduation needs representative evidence, named floors, and approval", () => {
		for (const text of [runtime, execute, delivery]) {
			expect(text).toContain("representative-run");
			expect(text).toContain("promotion approval");
			for (const floor of FAST_SAFETY_FLOORS) {
				expect(text).toContain(floor);
			}
		}
		expect(runtime).toContain("Public rankings");
		expect(execute).toContain("unscored fixture");
		expect(delivery).toContain("Public rankings never promote");
	});

	test("record-routing persist always supplies an explicit outcome file", () => {
		expect(draft).toContain("author-outcome.json");
		expect(execute).toContain("implement-outcome.json");
		expect(execute).toContain("review-outcome.json");
		expect(addressComments).toContain("classify-outcome.json");
		expect(addressComments).toContain("review-outcome.json");
		expect(runtime).toMatch(/explicit outcome/);
	});

	test("stages capture wall time automatically and never invent token counts", () => {
		for (const skill of [draft, execute, addressComments]) {
			expect(skill).toContain("capture-usage.ts");
			expect(skill).toContain("routing-scorecard.ts");
			expect(skill).toContain("start");
			expect(skill).toContain("finish");
			expect(skill).toContain(
				'Never write `{ "source": "unavailable" }` by hand',
			);
			expect(skill).toContain("--host");
			expect(skill).toContain("only when the runtime wrote that file");
		}
		expect(execute).toContain("implement-usage-timer.json");
		expect(execute).toContain("review-usage-timer.json");
		expect(draft).toContain("author-usage-timer.json");
		expect(addressComments).toContain("classify-usage-timer.json");
	});

	test("run scorecards do not present shadow recommendations as measured savings", () => {
		for (const skill of [draft, execute, addressComments]) {
			expect(skill).toMatch(
				/shadow quality and savings[\s\S]{0,80}unevaluated/i,
			);
			expect(skill).toContain("paired benchmark");
		}
	});

	test("address-comments holdout approve leaves the merge request draft", () => {
		expect(addressComments).toContain("[addressed !N]");
		expect(addressComments).not.toMatch(
			/`approve`[\s\S]{0,800}glab mr update <mr> --ready/,
		);
		expect(plain(addressComments)).toMatch(/approve[\s\S]{0,400}draft/i);
	});

	test("execute and address-comments verify gate evidence before reuse", () => {
		for (const skill of [execute, addressComments]) {
			expect(skill).toContain("verifyGateEvidence");
			expect(skill).toMatch(/test-gate\.ts"\s+verify/);
		}
	});

	test("pressure cannot bypass deterministic or human gates", () => {
		expect(execute).toMatch(/time pressure.*never.*skip.*red gate/i);
		expect(draft).toMatch(/sponsor|authority/i);
		expect(draft).toMatch(/failed readiness.*proceed/i);
		expect(addressComments).toMatch(/sunk cost|nitpick/i);
		expect(addressComments).toMatch(/never.*silently/i);
	});
});

describe("portable mutation boundaries", () => {
	test("mutating stage skills reference the stage gate", () => {
		for (const skill of [execute, delivery, addressComments, draft]) {
			expect(skill).toContain("canStartStage");
			expect(skill).toContain("stage-gating.ts");
			expect(skill).toContain("<runtime-manifest.json>");
			expect(skill).not.toContain("<runtime-id>");
		}
	});

	test("Claude Code settings hook targets the real commit-guard script", () => {
		const settings = JSON.parse(claudeSettings) as {
			hooks: { PreToolUse: Array<{ hooks: Array<{ command: string }> }> };
		};
		expect(settings.hooks.PreToolUse[0]?.hooks[0]?.command).toBe(
			'bun "$DELIVERY_FACTORY_ROOT/scripts/commit-guard.ts"',
		);
		expect(claudeAdapter).toMatch(/enforced/i);
	});

	test("Cursor is declared unenforced until a real hook exists", () => {
		expect(cursorAdapter).toMatch(/unenforced/i);
		expect(cursorAdapter).toMatch(/mutating stages? (stay |remain )?blocked/i);
	});
});

describe("normalized provider contracts", () => {
	test("an absent forge or tracker provider fails closed", () => {
		expect(readForgeChange({ kind: "forge", mode: "absent" }).reason).toBe(
			"missing-provider",
		);
		expect(readTrackerItem({ kind: "tracker", mode: "absent" })).toEqual(
			missingProvider("tracker"),
		);
		expect(
			invokeProvider({ kind: "review", mode: "absent" }, () => ({
				ok: true,
				value: true,
			})).ok,
		).toBe(false);
	});

	test("a fake forge and tracker return normalized results", () => {
		expect(
			readForgeChange(
				{ kind: "forge", mode: "available", invocation: "fake.forge" },
				() => ({ ok: true, change: { id: "12" } }),
			).value,
		).toEqual({ id: "12" });
		expect(
			readTrackerItem(
				{ kind: "tracker", mode: "available", invocation: "fake.tracker" },
				() => ({ ok: true, item: { key: "WORK-1" } }),
			).value,
		).toEqual({ key: "WORK-1" });
	});
});
