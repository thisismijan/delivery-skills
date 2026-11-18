import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { SDLC_BOARD_PHASES } from "./board-map";
import {
	BOARD_CONFIRM_INVOCATION,
	BOARD_PROPOSE_INVOCATION,
	BOARD_SYNC_INVOCATION,
} from "./board-status";
import {
	CHANGE_DESCRIPTION_INVOCATION,
	CHANGE_DESCRIPTION_SECTIONS,
	DECISIONS_SECTION,
	UNPROVEN_SECTION,
} from "./change-description";
import {
	DEFAULT_MAX_AWAITING_REVIEW,
	DEFAULT_MAX_PARALLEL_WORKTREES,
	DEFAULT_MAX_REVIEW_ROUNDS,
	DEFAULT_REVIEW_SETTLE_MINUTES,
	DEFAULT_ROUTING_PROFILING,
	DEFAULT_WORKER_IDLE_MINUTES,
} from "./config";
import { MAX_APPROACH_CHALLENGES } from "./draft-route";
import { FAST_SAFETY_FLOORS } from "./fast-dispatch";
import { FORGE_OPERATIONS, RetryForgePipelineInput } from "./forge-provider";
import {
	CHALLENGE_LABELS,
	CHALLENGE_MARKER,
	GROOM_DECISIONS_CHECK_INVOCATION,
	checkChallenges,
} from "./groom-decisions";
import {
	DELIVERY_LEVELS,
	LEVEL_SETTINGS,
	parseLevel,
	splitLevel,
} from "./levels";
import { MUTATION_PROOF_INVOCATION } from "./mutation-proof";
import {
	NEEDS_VALIDATION_ACK_PHRASE,
	NEEDS_VALIDATION_CHECK_INVOCATION,
	NEEDS_VALIDATION_HEADING,
} from "./needs-validation";
import { classifyEntry } from "./next-action";
import {
	invokeProvider,
	missingProvider,
	readForgeChange,
	readTrackerItem,
} from "./providers";
import { SKIPPED_WORKERS } from "./record-skip";
import {
	REVIEW_MEMORY_FILTER_INVOCATION,
	REVIEW_MEMORY_RECORD_INVOCATION,
} from "./review-memory";
import {
	REVIEW_ROUNDS_ALLOW_INVOCATION,
	REVIEW_ROUNDS_PREMISE_INVOCATION,
	REVIEW_ROUNDS_RECORD_INVOCATION,
} from "./review-rounds";
import { REVIEW_SCOPE_INVOCATION } from "./review-scope";
import { REVIEWER_SETTLE_INVOCATION } from "./reviewer-settle";
import { SAFE_GIT_CONFIG } from "./safe-git";
import {
	MAX_SANDBOX_ENV,
	MAX_SANDBOX_SETUP,
	SANDBOX_CHECK_INVOCATION,
	SANDBOX_CONFIRM_INVOCATION,
	SANDBOX_ENGINES,
	SANDBOX_PATH,
	SANDBOX_RUN_INVOCATION,
	SANDBOX_STOP_INVOCATION,
} from "./sandbox-run";
import {
	CONSTITUTION_CHECK_INVOCATION,
	CONSTITUTION_FREEZE_INVOCATION,
	CONSTITUTION_LEVEL_INVOCATION,
	CONSTITUTION_PREFLIGHT_INVOCATION,
	CONSTITUTION_REPORT_INVOCATION,
	CONSTITUTION_VERSION,
	contractLevel,
	freezeAgainstLiveConstitution,
	loadConstitution,
} from "./sdlc-constitution";
import { parseSkillDescription } from "./skill-metadata";
import { MAX_DERIVED_ACCEPTANCE_CRITERIA } from "./verdicts";
import { WORKER_WATCH_INVOCATION } from "./worker-watch";
import { WORKTREE_CLOSE_INVOCATION } from "./worktree-close";
import {
	WORKTREE_FILES_CONFIRM_INVOCATION,
	WORKTREE_FILES_COPY_INVOCATION,
	WORKTREE_FILES_PATH,
	WORKTREE_FILES_PROPOSE_INVOCATION,
} from "./worktree-files";

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
const routingProfiling = read("reference/routing-profiling.md");
const mechanicalEditUnits = read("reference/mechanical-edit.md");
const fastModels = read("reference/fast-models.md");
const executeReference = (name: string) =>
	read(`../skills/execute/reference/${name}.md`);
const executeReEntry = executeReference("re-entry");
const executeScriptedEdit = executeReference("scripted-edit");
const executeVerdictRoutes = executeReference("verdict-routes");
const executeHeldOutSamples = executeReference("held-out-samples");
const executeTestContradictsSpec = executeReference("test-contradicts-spec");
const executeModelSelection = executeReference("model-selection");
const executeFlow = [
	execute,
	executeScriptedEdit,
	routingProfiling,
	mechanicalEditUnits,
	fastModels,
].join("\n");
const addressComments = read("../skills/address-comments/SKILL.md");
const ADDRESS_COMMENTS_REFERENCES = [
	"also-at",
	"empty-scope",
	"gate-evidence-reuse",
	"mechanical-edit-unit",
	"premise-check",
	"scope-rules",
	"suggestion-apply",
	"test-gap",
] as const;
const addressCommentsReference = Object.fromEntries(
	ADDRESS_COMMENTS_REFERENCES.map((name) => [
		name,
		read(`../skills/address-comments/reference/${name}.md`),
	]),
) as Record<(typeof ADDRESS_COMMENTS_REFERENCES)[number], string>;
const commentClassificationProfiling =
	routingProfiling.split("## Comment classification")[1] ?? "";
const addressCommentsFlow = [
	addressComments,
	commentClassificationProfiling,
	mechanicalEditUnits,
	...Object.values(addressCommentsReference),
].join("\n");
const groom = read("../skills/groom/SKILL.md");
const groomPrdAndSplits = read("../skills/groom/reference/prd-and-splits.md");
const delivery = read("../skills/delivery/SKILL.md");
const deliveryEntries = read("../skills/delivery/reference/entries.md");
const deliveryLevels = read("../skills/delivery/reference/levels.md");
const deliveryOrchestration = read(
	"../skills/delivery/reference/orchestration.md",
);
const deliveryWorkItemChoice = read(
	"../skills/delivery/reference/work-item-choice.md",
);
const setup = read("../skills/delivery/workflows/setup.md");
const decisionBrief = read("../skills/delivery/reference/decision-brief.md");
const auto = read("../skills/delivery/workflows/auto.md");
const epicToBacklog = read("../skills/delivery/workflows/epic-to-backlog.md");
const ledger = read("../skills/delivery/workflows/delivery-ledger.md");
const mrReview = read("../skills/mr-review/SKILL.md");
const codeReviewMax = read("../skills/code-review-max/SKILL.md");
const ticketToMr = read("../skills/delivery/workflows/ticket-to-mr.md");
const mrReviewToReady = read(
	"../skills/delivery/workflows/mr-review-to-ready.md",
);
const releaseReadiness = read(
	"../skills/delivery/workflows/release-readiness.md",
);
const pipelineMonitoring = read(
	"../skills/delivery/workflows/pipeline-monitoring.md",
);
const notes = read("../skills/delivery/workflows/NOTES.md");
const orchestrator = read(
	"../skills/delivery/workflows/delivery-orchestrator.md",
);
const conventions = read("CONVENTIONS.md");
const runtime = read("RUNTIME.md");
const FORGE_PROVIDER = 'bun "${FACTORY_ROOT}/scripts/forge-provider.ts"';
const PROVIDER_NATIVE = /\b(?:gl-mr|gl-note|glab)\b/;
const cursorAdapter = read("../adapters/cursor/README.md");
const cursorHooks = read("../adapters/cursor/hooks.json");
const claudeAdapter = read("../adapters/claude-code/README.md");
const claudeSettings = read("../adapters/claude-code/settings.json");
const rootReadme = read("../README.md");
const workflowDocs = read("../docs/workflow.md");
const referenceDocs = read("../docs/reference.md");

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
		const maxReview = codeReviewMax;
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
		expect(executeReEntry).toMatch(
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
		expect(delivery).toContain("Never merge via the forge provider");
		expect(delivery).toMatch(/Never close a change or resolve threads/i);
	});

	test("parallel workers use isolated worktrees and coordinator-owned state", () => {
		const contract = plain(auto);
		expect(contract).toMatch(/maxParallelWorktrees/i);
		expect(contract).toMatch(/MAX_PARALLEL_WORKTREES/);
		expect(contract).toContain(`default ${DEFAULT_MAX_PARALLEL_WORKTREES}`);
		expect(contract).toMatch(/one detached git worktree per dispatched key/i);
		expect(contract).toMatch(
			/Start every worker in the current batch before awaiting any one/i,
		);
		expect(contract).toMatch(/coordinator remains the only writer/i);
		expect(auto).toContain("DELIVERY_WORKER_JOURNAL");
		expect(ledger).toContain("### Parallel worker journals");
		expect(ledger).toMatch(
			/worker must not search for or\s+mutate the run ledger/i,
		);
	});

	test("every live workflow and operator doc states the configured worktree cap", () => {
		for (const document of [auto, deliveryEntries, epicToBacklog, rootReadme]) {
			expect(plain(document)).toMatch(/maxParallelWorktrees/i);
		}
		expect(delivery).toContain("`reference/entries.md`");
		for (const document of [
			auto,
			epicToBacklog,
			rootReadme,
			workflowDocs,
			referenceDocs,
		]) {
			expect(plain(document)).toMatch(/MAX_PARALLEL_WORKTREES/);
			expect(plain(document)).toMatch(
				new RegExp(
					`default\\s+${DEFAULT_MAX_PARALLEL_WORKTREES}|at most\\s+${DEFAULT_MAX_PARALLEL_WORKTREES}`,
					"i",
				),
			);
		}
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
			codeReviewMax,
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
		expect(groom).toMatch(/Do not ask a simple decision/i);
		expect(groom).toMatch(/simple decisions are taken/i);
		expect(groom).toMatch(/operator-owned decisions are asked/i);
		expect(groom).toMatch(/Human decision brief/i);
		expect(groom).toMatch(/two or more viable.*product or slicing/is);
		expect(plain(groom)).toMatch(/withholds the recommendation/i);
		expect(groom).toContain("decisions.md");
		expect(groom).toContain("Agent decided:");
		expect(groom).toMatch(/verify-ticket\.ts" "<output-dir>\/source\.md"/);
		expect(groom).toMatch(/verify-ticket\.ts" --fill-housekeeping/);
		expect(plain(groom)).toMatch(/do not dispatch the groom-explorer/i);
		expect(plain(groom)).toMatch(/do not run the grilling loop/i);
		expect(plain(groom)).toMatch(
			/do not dispatch the groom-writer[\s\S]*atomically copy source\.md/i,
		);
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

describe("groom evidence push-back", () => {
	const groomStep = (id: string) => {
		const found = groom
			.split(/^### Step /m)
			.find((chunk) => chunk.startsWith(`${id} `));
		if (!found) throw new Error(`groom has no step ${id}`);
		return plain(found);
	};
	const hardRules = plain(
		groom.slice(groom.indexOf("## Hard rules"), groom.indexOf("## Steps")),
	);

	test("step 3 appends the explorer's report per session before grilling and never overwrites", () => {
		const step3 = groomStep("3");
		expect(step3).toContain("explorer-report.md");
		expect(step3).toContain("## Session <ordinal>");
		expect(step3).toMatch(/word for word/i);
		expect(step3).toMatch(/one more than the number of ## Session headings/i);
		expect(step3).toMatch(/groom-paths\.ts"? verify/);
		expect(step3).toMatch(/before the first (grilling )?question/i);
		expect(step3).toMatch(/(never|not) overwrit/i);
		expect(step3).toMatch(/run log/i);
		expect(step3).toMatch(/before (the operator )?approv/i);
		expect(plain(groom)).toMatch(
			/later session[\s\S]{0,200}new ## (heading|section)/i,
		);
	});

	test("a skipped explorer appends no section and challenges no pick", () => {
		for (const step of [groomStep("2a"), groomStep("5")]) {
			expect(step).toMatch(/no section is appended|appends? no section/i);
			expect(step).toMatch(
				/no pick is challenged|nothing is challenged|challenges? no pick/i,
			);
		}
	});

	test("step 5 challenges a contradicting pick once, quoting the passage, in its own turn", () => {
		const step5 = groomStep("5");
		expect(step5).toContain("explorer-report.md");
		expect(step5).toMatch(/challenges? [^.]{0,80}once/i);
		expect(step5).toMatch(/own turn/i);
		expect(step5).toMatch(/single question|only question/i);
		expect(step5).toMatch(/word for word/i);
		expect(step5).toMatch(/keeps? the pick or changes? it|keep or change/i);
		expect(step5).toMatch(/name[sd]? the pick/i);
	});

	test("step 5 raises the challenge before that question's decision entry is appended", () => {
		const step5 = groomStep("5");
		expect(step5).toMatch(
			/challenge[^.]{0,200}before[^.]{0,120}entry[^.]{0,80}append|entry and the five[^.]{0,40}lines[^.]{0,60}written together[^.]{0,80}after the operator (answers|decides)/i,
		);
	});

	test("both step 2a shortcuts record Agent decided in decisions.md", () => {
		const step2a = groomStep("2a");
		const plainExit = step2a.slice(
			step2a.indexOf("When the exit is zero"),
			step2a.indexOf("When the exit is non-zero"),
		);
		const housekeepingExit = step2a.slice(
			step2a.indexOf("When that exit is zero"),
			step2a.indexOf("When that exit is still non-zero"),
		);
		for (const branch of [plainExit, housekeepingExit]) {
			expect(branch.length).toBeGreaterThan(0);
			expect(branch).toMatch(
				/(record|write|append)[^.]{0,80}Agent decided:[^.]{0,80}decisions\.md/i,
			);
		}
	});

	test("step 5 describes the challenged pick as the settled pick, not the pick as first given", () => {
		const step5 = groomStep("5");
		expect(step5).toMatch(/Challenged pick: <the settled pick[^>]*>/);
		expect(step5).toMatch(
			/pick standing after[^.]{0,80}recommendation[^.]{0,40}reveal[^.]{0,60}change/i,
		);
		expect(step5).not.toMatch(/as first given/i);
	});

	test("step 5 raises the challenge after the recommendation reveal", () => {
		const step5 = groomStep("5");
		expect(step5).toMatch(
			/(after|once)[^.]{0,120}withheld recommendation[^.]{0,120}reveal/i,
		);
		expect(step5).toMatch(/final pick[^.]{0,80}recorded after the challenge/i);
	});

	test("step 5 challenges only when it can quote a contradicting passage and otherwise records the pick as usual", () => {
		const step5 = groomStep("5");
		expect(step5).toMatch(/only when[^.]{0,80}quote/i);
		expect(step5).toMatch(
			/(otherwise|without a challenge|no passage|cannot quote)[^.]{0,120}(record|no challenge)/i,
		);
		const ordinaryLog = [
			"## Grilling",
			"Question: Which queue?",
			"Options: A) keep it, B) replace it",
			"Pick: A",
			"Withheld recommendation: A",
			"Differed: no",
			"Agent decided: the input names one outcome",
		].join("\n");
		const result = checkChallenges(ordinaryLog, "");
		expect(result.ok).toBe(true);
		expect(result.entries).toBe(0);
	});

	test("step 5 makes the operator's decision final", () => {
		const step5 = groomStep("5");
		expect(step5).toMatch(
			/records? [^.]{0,120}(decides|decision)[^.]{0,120}challenge/i,
		);
		expect(step5).toMatch(/(never|not) asks?[^.]{0,60}pick again/i);
		expect(step5).toMatch(/(never|not) challenges? (the|a) changed pick/i);
		expect(step5).toMatch(/(never|not) blocks? or overrides?/i);
	});

	test("step 5 names the marker, labels, decisions and where the entry goes", () => {
		const step5 = groomStep("5");
		expect(step5).toContain(CHALLENGE_MARKER);
		for (const label of CHALLENGE_LABELS) {
			expect(step5).toContain(label);
		}
		expect(step5).toMatch(/\bkept\b/);
		expect(step5).toMatch(/\bchanged\b/);
		expect(step5).toMatch(/directly after the Differed: line/i);
		expect(step5.indexOf(CHALLENGE_MARKER)).toBeLessThan(
			step5.indexOf("Final pick:"),
		);
	});

	test("the Hard rules allow Bash to run groom-decisions.ts", () => {
		for (const script of [
			"groom-paths.ts",
			"verify-ticket.ts",
			"human-text.ts",
			"groom-decisions.ts",
		]) {
			expect(hardRules).toContain(script);
		}
	});

	test("step 8 runs the check before the writer is dispatched or a source is copied, and a failure stops the run", () => {
		const step8 = groomStep("8");
		const invocation = plain(GROOM_DECISIONS_CHECK_INVOCATION);
		const at = step8.indexOf(invocation);
		expect(at).toBeGreaterThanOrEqual(0);
		expect(at).toBeLessThan(step8.indexOf("groom-writer"));
		expect(at).toBeLessThan(step8.indexOf("atomically copy"));
		expect(step8).toMatch(/non-zero exit[\s\S]{0,200}stops? the run/i);
		expect(step8).toMatch(/correct(ed|s)?[\s\S]{0,160}decisions\.md/i);
		expect(step8).toMatch(
			/(not|never) writes? drafts? (on|when|while)[^.]{0,30}failing check/i,
		);
	});
});

describe("context-rich human decisions", () => {
	test("the conductor owns the canonical brief", () => {
		expect(delivery).toContain("## Human decision brief");
		expect(delivery).toContain("read and follow `reference/decision-brief.md`");
		expect(decisionBrief).toContain("### DSA lens");
		expect(decisionBrief).toContain("### System-design lens");
		expect(decisionBrief).toContain("No material DSA difference");
		expect(decisionBrief).toContain("No material system-design");
		expect(decisionBrief).toMatch(/Never invent Big-O claims/i);
		expect(plain(decisionBrief)).toMatch(/do not include a recommendation/i);
		expect(plain(decisionBrief)).toMatch(/after they choose/i);
		expect(decisionBrief).toContain("## Your choice:");
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
		expect(decisionBrief).toMatch(/failed gate never\s+becomes an\s+option/i);
		expect(delivery).toMatch(/factory owns simple decisions/i);
		expect(auto).toMatch(/Contradictory or unattributable.*remains a stop/is);
		expect(auto).toMatch(/Ask only when[\s\S]*factory cannot decide/i);
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

	test("groom loads the PRD and slice breakdown only for a PRD-worthy or split-worthy ask", () => {
		const pointer = "read `reference/prd-and-splits.md` when";
		const step = (id: string) =>
			groom.split(/^### Step /m).find((chunk) => chunk.startsWith(`${id} `)) ??
			"";
		expect(step("6").toLowerCase()).toContain(pointer);
		expect(plain(step("6"))).toMatch(/PRD-worthy initiative/);
		expect(plain(step("6"))).toMatch(/no PRD was written and give the reason/);
		expect(step("7").toLowerCase()).toContain(pointer);
		expect(plain(step("7"))).toMatch(/PRD-worthy or split-worthy/);

		const reference = plain(groomPrdAndSplits);
		expect(groomPrdAndSplits.startsWith("# ")).toBe(true);
		expect(reference).toMatch(
			/Problem, Solution, User stories, Success criteria, Constraints \/ NFRs, Out of scope/,
		);
		expect(reference).toMatch(
			/MUST NOT contain an Implementation decisions or Test seams section/,
		);
		expect(reference).toMatch(/write no file before slice approval/i);
		expect(reference).toMatch(/exactly one user story/i);
		for (const label of [
			"Title",
			"Blocked by",
			"Story covered",
			"Observable outcome",
			"Acceptance criteria",
			"Out of scope",
		]) {
			expect(groomPrdAndSplits).toContain(`- **${label}**:`);
		}
		expect(reference).toMatch(
			/two or more viable breakdowns.*Human decision brief/i,
		);
		expect(reference).toMatch(/expand-contract exception/i);
		expect(reference).toMatch(/rollback boundary/i);
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
		expect(draft).toMatch(/ticket-structure\.ts"/);
		expect(draftContract).toMatch(/when skipAssessor is true/i);
		expect(draftContract).toMatch(/do not dispatch the ticket-assessor/i);
		expect(draftContract).toMatch(
			/recorded blockers skip the assessor even when the body is otherwise valid/i,
		);
		expect(draftContract).toMatch(
			/complete ticket with no question mark[\s\S]*scripted good verdict/i,
		);
		expect(draftContract).toMatch(
			/size warning skips the assessor as too large/i,
		);
		expect(assessor).toMatch(
			/does not dispatch you when the work item body fails/i,
		);
		expect(plain(ticketAssessor)).toMatch(
			/already complete with no open questions/i,
		);
		expect(plain(ticketAssessor)).toMatch(/size warning/i);
		expect(draft).toMatch(/ticket-feasibility\.ts"/);
		expect(draftContract).toMatch(/when skipAnalyst is true/i);
		expect(draftContract).toMatch(/do not dispatch the feasibility-analyst/i);
		expect(draftContract).toMatch(
			/complete ticket with no question mark[\s\S]*scripted feasible verdict/i,
		);
		expect(draftContract).toMatch(
			/question mark in a URL, inline code, or optional syntax does not count/i,
		);
		expect(draft).toMatch(
			/no named authentication, authorization, secrets, credentials/i,
		);
		expect(plain(mechanicalEditUnits)).toMatch(
			/typescript, javascript, python, java, go, c#, and kotlin/i,
		);
		expect(plain(read("agents/feasibility-analyst.md"))).toMatch(
			/already complete with no open questions/i,
		);
	});

	test("assessor treats one cohesive contract as one cluster instead of splitting by default", () => {
		const assessor = plain(ticketAssessor);
		expect(assessor).not.toMatch(/when in doubt, prefer a split/i);
		expect(assessor).toMatch(
			/extend the same public function, type, or class in one cohesive code area are one cluster/i,
		);
		expect(assessor).toMatch(
			/split only when you can name two outcomes that touch different public contracts or code areas/i,
		);
	});

	test("assessor states the criteria cap the verdict enforces and keeps constraints out of it", () => {
		const words = ["zero", "one", "two", "three", "four", "five"];
		const cap = words[MAX_DERIVED_ACCEPTANCE_CRITERIA];
		const field = plain(
			ticketAssessor.match(/^- `derivedAcceptanceCriteria`:.*$/m)?.[0] ?? "",
		);
		expect(field).toContain(`at most ${cap}`);
		expect(field).toMatch(/constraint/i);
		expect(field).toMatch(/too_large/);
	});
});

describe("bounded recovery and replay safety", () => {
	test("execute reconciles durable state before writing", () => {
		expect(execute).toContain("Re-entry reconciliation");
		expect(executeReEntry).toContain("Re-entry reconciliation");
		for (const artifact of [
			"existing MR",
			"test files",
			"gate artifacts",
			"commits",
			"dirty worktree",
		]) {
			expect(executeReEntry).toContain(artifact);
		}
		expect(executeReEntry).toMatch(
			/never (rewrite|replace) already-proven tests/i,
		);
		expect(executeReEntry).toMatch(/never open a duplicate MR/i);
	});

	test("resume and execute escalate unattributable branch, gate, or dirty-tree evidence", () => {
		expect(plain(executeReEntry)).toMatch(
			/stop and escalate rather than guessing/i,
		);
		expect(plain(delivery)).toMatch(/cannot be attributed/i);
		expect(plain(delivery)).toMatch(/never discard/i);
	});

	test("a test that contradicts the spec goes back to the test writer, not another implementer fix", () => {
		for (const agent of [implementer, implementerOpus]) {
			expect(agent).toContain(
				"- **Test contradicts spec:** `none`, or one line per failing test",
			);
			expect(plain(agent)).toMatch(/leave the source matching the spec/i);
		}
		const route = plain(execute);
		expect(route).toMatch(
			/lists a failing test under test contradicts spec , do not dispatch the implementer for that test/i,
		);
		const sentToWriter = plain(executeTestContradictsSpec);
		expect(sentToWriter).toMatch(/dispatch the test-writer once/i);
		expect(sentToWriter).toMatch(
			/never removes or loosens any other assertion/i,
		);
		expect(route).toMatch(
			/a second contradiction on the same test stops and escalates/i,
		);
		const sentBack = plain(testWriter);
		expect(sentBack).toMatch(
			/re-derive the expected value from the spec scenario yourself/i,
		);
		expect(sentBack).toMatch(/if the test is right, change nothing/i);
	});

	test("mechanical-edit units are classified before dispatch and never self-assigned", () => {
		for (const skill of [executeFlow, addressCommentsFlow]) {
			expect(skill).toContain("apply-mechanical-edit.ts");
			expect(plain(skill)).toMatch(
				/do not ask the implementer whether the work is menial/i,
			);
			expect(plain(skill)).toMatch(/helper already wrote/i);
			expect(plain(skill)).toMatch(/payload flag is not proof/i);
			expect(plain(skill)).toMatch(/do not dispatch a catalogue fast model/i);
		}
		expect(plain(executeFlow)).toMatch(
			/when apply is script.*do not dispatch the test-writer or the implementer/i,
		);
		const implementStep = execute.split("**Implement to green.**")[1] ?? "";
		expect(plain(implementStep)).toMatch(
			/when apply is script[\s\S]*do not dispatch the implementer[\s\S]*continue at the green gates/i,
		);
		expect(plain(implementStep)).not.toMatch(
			/do not dispatch the implementer[\s\S]{0,80}dispatch the implementer/i,
		);
		expect(plain(executeFlow)).toMatch(/do not run a red gate/i);
		expect(plain(ticketToMr)).toMatch(
			/scripted mechanical-edit unit skips the test-writer, red gate, and implementer/i,
		);
		expect(addressComments).toMatch(/nitpick/i);
		expect(plain(addressComments)).toMatch(/make no code change/i);
		expect(runtime).toContain("mechanical-edit.ts");
		expect(runtime).toContain("apply-mechanical-edit.ts");
		expect(runtime).toContain("mechanical-edit-scoring.ts");
		expect(runtime).toContain("mechanical-edit-test-repos.ts");
		expect(runtime).toContain("test-repo-stand-in");
		expect(runtime).toContain("mechanical-edit-model-runs.ts");
		expect(runtime).toContain("model-run");
		expect(runtime).toContain("TypeScript");
		expect(runtime).toContain("Python");
		expect(runtime).toContain("Java");
		expect(runtime).toContain("Go");
		expect(runtime).toContain("C#");
		expect(runtime).toContain("Kotlin");
		expect(plain(executeFlow)).toMatch(/unique python parameter or local/i);
		expect(plain(executeFlow)).toMatch(/unique java field/i);
		expect(plain(executeFlow)).toMatch(
			/unique typescript, python, java, go, c#, or kotlin missing import/i,
		);
		expect(plain(executeFlow)).toMatch(/google-java-format/i);
		expect(plain(executeFlow)).toMatch(
			/rust, php, and swift format-only.*bin\/rustfmt.*bin\/php-format.*bin\/swift-format/i,
		);
		expect(plain(addressCommentsFlow)).toMatch(
			/rust, php, and swift format-only.*bin\/rustfmt.*bin\/php-format.*bin\/swift-format/i,
		);
		expect(plain(rootReadme)).toMatch(
			/python function, class,\s*parameter, or local/i,
		);
		const controller = read("agents/task-profile-controller.md");
		expect(controller).toContain("mechanical-edit");
		expect(controller).toMatch(
			/Do not label ordinary implement as mechanical-edit/,
		);
	});

	test("repeated failures force a premise check before a third fix", () => {
		for (const skill of [execute, addressCommentsFlow]) {
			const contract = plain(skill);
			expect(contract).toMatch(/two failures.*same assumption/i);
			expect(contract).toMatch(/state the premise/i);
			expect(contract).toMatch(/one discriminating observation/i);
			expect(contract).toMatch(/no third fix/i);
		}
	});

	test("review cost controls preserve the high-risk and changed-code paths", () => {
		const maxReview = plain(codeReviewMax);
		expect(maxReview).toMatch(/resolve standard/);
		expect(maxReview).toMatch(/small reversible change.*at most 2 files/i);
		expect(maxReview).toMatch(/small reversible change.*lenses 1 and 2/i);
		expect(maxReview).toMatch(/full review.*all four lenses/i);
		expect(maxReview).toMatch(/unknown classification/i);
		expect(maxReview).toMatch(/review-fanout\.ts/);
		expect(maxReview).toMatch(/lenses array is authoritative/i);
		expect(maxReview).toMatch(/non-zero exit stops the review/i);
		expect(maxReview).toMatch(
			/review-fanout\.ts" measure <base-sha> <head-sha>/,
		);
		expect(maxReview).toMatch(/classify surfaces from its paths only/i);
		expect(maxReview).toMatch(/review-fanout\.ts" adjudication/);
		expect(maxReview).toMatch(/standard ?: every candidate is low/i);
		expect(maxReview).toMatch(/it may raise a severity/i);
		expect(maxReview).toMatch(
			/small reversible or contained change, run lenses 1 and 2/i,
		);
		expect(maxReview).toMatch(
			/lenses is empty[\s\S]*do not dispatch review-lens/i,
		);
		expect(maxReview).toMatch(
			/contained change is reversible, touches at most 6 files with fewer than 400 changed lines/i,
		);
		expect(maxReview).toMatch(/bound every command's output/i);
		expect(maxReview).toMatch(
			/main ?: a candidate is medium or above\. the main conversation adjudicates/i,
		);
		expect(maxReview).toMatch(
			/give lenses this brief and the pinned diff, not a bundled review packet/i,
		);
		expect(plain(codeReviewMax)).toMatch(
			/review-packet\.ts" --ticket <work-item file> --spec <change dir> --diff <pinned diff> --evidence <lens 1 candidates> \.\.\. --evidence \.review\/mr-<iid>\/<full-head-sha>\/memory-filter\.json --out \.review\/mr-<iid>\/<full-head-sha>\/adjudication-packet\.md/,
		);
		expect(maxReview).toMatch(
			/reads that packet first instead of opening each input on its own/i,
		);
		expect(maxReview).toMatch(
			/reads the cited code of several candidates in one command/i,
		);
		expect(plain(execute)).toMatch(
			/review-packet\.ts" --ticket <work-item-file> --spec <changeDir> --context <reviewDir>\/code-map\.md --out <reviewDir>\/test-packet\.md/,
		);
		expect(plain(testWriter)).toMatch(/packet , read it first/i);
		expect(plain(execute)).toMatch(
			/review-packet\.ts" --ticket <work-item-file> --spec .* --diff <reviewDir>\/diff\.patch --evidence <artifact>\.\.\. --out <reviewDir>\/review-packet\.md/,
		);
		expect(plain(holdoutReviewer)).toMatch(/review packet ?, read it first/i);
		expect(plain(holdoutReviewer)).toMatch(
			/open another file only to settle something the packet cannot/i,
		);
		expect(plain(execute)).toMatch(
			/review-packet\.ts" --ticket <work-item-file> --spec .* --diff <reviewDir>\/implement-diff\.patch --evidence <red-gate-artifact> --context <reviewDir>\/code-map\.md --out <reviewDir>\/implement-packet\.md/,
		);
		expect(plain(execute)).toMatch(/rebuild it before every fix dispatch/i);
		for (const agent of [implementer, implementerOpus]) {
			expect(plain(agent)).toMatch(/packet , read it first/i);
		}
		expect(plain(implementer)).toMatch(
			/finding needs behaviour the spec does not define, add one scenario for it to the change's delta spec in the same fix/i,
		);
		expect(plain(implementer)).toMatch(/exercises the public interface only/i);

		const comments = plain(addressComments);
		const commentsFlow = plain(addressCommentsFlow);
		expect(comments).toMatch(
			/if in-scope comments are empty, do not dispatch/i,
		);
		expect(comments).toMatch(/forge-comments\.ts" scope/i);
		expect(commentsFlow).toMatch(
			/missing path or a new-side line past the end/i,
		);
		expect(comments).toMatch(/drops resolved discussions and resolved notes/i);
		expect(commentsFlow).toMatch(/empty or whitespace-only body is outdated/i);
		expect(commentsFlow).toMatch(
			/only acknowledgements such as LGTM, thanks, approved, or done is outdated/i,
		);
		expect(commentsFlow).toMatch(/only a mention is outdated/i);
		expect(commentsFlow).toMatch(/only a URL is outdated/i);
		expect(commentsFlow).toMatch(/only emoji is outdated/i);
		expect(comments).toMatch(/only a suggestion fence on a new-side/i);
		expect(commentsFlow).toMatch(/forge-comments\.ts" apply-suggestion/i);
		expect(commentsFlow).toMatch(
			/apply is script ?, the helper already replaced that line, so do not dispatch the implementer/i,
		);
		expect(comments).toMatch(
			/bug still needs its red test\s+first, and the green gate, lint, and typecheck still run/i,
		);
		expect(commentsFlow).toMatch(
			/body is only a suggestion fence[\s\S]*suggested text is already in that file[\s\S]*outdated/i,
		);
		expect(comments).toMatch(
			/head still equals the step 2 revision.*no re-review-pending\.json existed on entry.*skip the cumulative gates because their code input is unchanged/i,
		);
		expect(comments).toMatch(
			/otherwise, run one full green gate, lint, and typecheck in parallel over the cumulative branch/i,
		);
		expect(comments).toMatch(/this round runs no review of its own/i);
		expect(comments).not.toMatch(/dispatch a fresh holdout-reviewer/i);
		expect(comments).toMatch(
			/stage 3 still runs \/code-review-max and \/mr-review/i,
		);
		expect(plain(execute)).toMatch(
			/reconcile implementation state without another model call.*do not dispatch the implementer or another subagent/i,
		);
	});

	test("shadow routing is opt-in and never changes live dispatch", () => {
		expect(executeFlow).toContain("select-model.ts");
		expect(executeFlow).toContain("shadow-route.ts");
		expect(executeFlow).toContain("task-profile-controller");
		expect(executeFlow).toContain("record-routing.ts");
		expect(executeFlow).toContain(".delivery/routing/");
		expect(executeFlow).toContain("90 percent");
		expect(executeFlow).toContain(
			"Dispatch still uses the live `select-model.ts`",
		);
		expect(executeFlow).toContain("model-catalogue.ts");
		expect(plain(executeFlow)).toContain("never this run's worker");
		expect(draft).toContain("do not change the model used to author");
		expect(draft).toContain("task-profile-controller");
		expect(addressCommentsFlow).toContain("semantic standard route");
		expect(addressCommentsFlow).toContain("task-profile-controller");
		for (const skill of [draft, executeFlow, addressCommentsFlow]) {
			const contract = plain(skill);
			expect(contract).toMatch(
				/only when (?:it|routingProfiling) is (?:exactly )?always/i,
			);
			expect(contract).toMatch(/routingProfiling.*off.*skip/i);
		}
		expect(plain(executeFlow)).toMatch(
			/regardless of this setting, dispatch the holdout-reviewer/i,
		);
		expect(plain(addressCommentsFlow)).not.toMatch(/holdout-reviewer/i);
		for (const document of [
			delivery,
			rootReadme,
			referenceDocs,
			workflowDocs,
		]) {
			expect(document).toContain("ROUTING_PROFILING");
			expect(plain(document)).toMatch(
				new RegExp(`defaults?(?: to)? ${DEFAULT_ROUTING_PROFILING}`, "i"),
			);
		}
	});

	test("the max review runs the coverage and paths commands in the one-line double-quoted form", () => {
		const maxReview = plain(codeReviewMax);
		expect(maxReview).toMatch(
			/review-fanout\.ts" coverage "<base-or-since>" "<full-head-sha>" "[^"]*lens-coverage-input\.json" "[^"]*lens-coverage\.json"/,
		);
		expect(maxReview).toMatch(
			/review-fanout\.ts" paths "?<base-or-since>"? "?<(?:full-)?head(?:-sha)?>"?/,
		);
		const invocation = codeReviewMax
			.split("\n")
			.find((line) => line.includes('review-fanout.ts" coverage'));
		expect(invocation).toMatch(
			/^\s*bun "\$\{FACTORY_ROOT\}\/scripts\/review-fanout\.ts" coverage "[^"]+" "[^"]+" "[^"]+" "[^"]+"/,
		);
		const coverageAt = codeReviewMax.indexOf('review-fanout.ts" coverage');
		expect(coverageAt).toBeGreaterThan(
			codeReviewMax.indexOf("## Parallel review"),
		);
		expect(coverageAt).toBeLessThan(
			codeReviewMax.indexOf('review-fanout.ts" adjudication'),
		);
	});

	test("a focused coverage pass takes the exact standard-tier model identifier", () => {
		const check = plain(
			textBetween(
				codeReviewMax,
				"## Check coverage",
				"## Adjudicate every candidate",
			),
		);
		expect(check).toMatch(/standard/i);
		expect(check).toMatch(/exact model identifier/i);
		expect(check).toMatch(/read-only subagent/i);
		expect(check).toMatch(
			/(main conversation|adjudicat)[^.]{0,120}(candidate|focused)|(candidate|focused)[^.]{0,120}adjudicat/i,
		);
	});

	test("operator docs name the coverage check and say the examined lists are self-reported", () => {
		for (const document of [referenceDocs, workflowDocs, conventions]) {
			const text = plain(document);
			expect(text).toMatch(/coverage check/i);
			expect(text).toMatch(/focused pass/i);
			expect(text).toMatch(
				/self-reported|lenses'? own reports?|reported (?:as )?examin/i,
			);
		}
	});

	test("operator docs describe risk-based review spend", () => {
		for (const document of [rootReadme, workflowDocs, referenceDocs, runtime]) {
			expect(document).toContain("review-fanout.ts");
			expect(plain(document)).toMatch(/small reversible change/i);
		}
		expect(plain(rootReadme)).toMatch(/reply-only round/i);
		expect(plain(workflowDocs)).toMatch(/reply-only round/i);
		expect(plain(referenceDocs)).toMatch(/lenses array is authoritative/i);
		expect(plain(runtime)).toMatch(/lenses array is authoritative/i);
		expect(plain(rootReadme)).toMatch(
			/typescript, javascript, python, java, go, c#, or kotlin/i,
		);
		expect(plain(rootReadme)).toMatch(
			/acknowledgement-only, mention-only, url-only, and emoji-only/i,
		);
		expect(plain(referenceDocs)).toMatch(
			/forge-comments\.ts" apply-suggestion/i,
		);
		expect(plain(referenceDocs)).toMatch(/ticket-feasibility\.ts/i);
		expect(plain(workflowDocs)).toMatch(
			/whole-body suggestion fence is applied without the implementer/i,
		);
		expect(plain(rootReadme)).toMatch(
			/\/execute skips the test-writer, red gate, and implementer/i,
		);
		expect(plain(workflowDocs)).toMatch(/unique python parameter or local/i);
		expect(plain(rootReadme)).toMatch(
			/unique typescript, python, java, go, c#, or kotlin missing import/i,
		);
		expect(plain(referenceDocs)).toMatch(/node_modules\/\.bin\/prettier/i);
		expect(plain(referenceDocs)).toMatch(/bin\/google-java-format/i);
		expect(plain(referenceDocs)).toMatch(/bin\/rustfmt/i);
		expect(plain(referenceDocs)).toMatch(/bin\/php-format <file> reads stdin/i);
		expect(plain(referenceDocs)).toMatch(
			/bin\/swift-format format --assume-filename <file>/i,
		);
		expect(plain(referenceDocs)).toMatch(
			/rust is format-only; rename and import-only remain on the worker/i,
		);
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
		expect(plain(delivery)).toContain(
			"Read reference/orchestration.md before you dispatch a subagent or isolated worker, register or promote a fast model",
		);
		for (const text of [runtime, executeFlow, deliveryOrchestration]) {
			expect(text).toContain("representative-run");
			expect(text).toContain("promotion approval");
			for (const floor of FAST_SAFETY_FLOORS) {
				expect(text).toContain(floor);
			}
		}
		expect(runtime).toContain("Public rankings");
		expect(executeFlow).toContain("unscored fixture");
		expect(executeFlow).toContain("test-repo stand-in");
		expect(deliveryOrchestration).toContain("Public rankings never promote");
		expect(deliveryOrchestration).toContain(
			"Test-repo stand-in scores never promote",
		);
	});

	test("draft generates tasks from spec scenarios", () => {
		expect(draft).toContain("generate-tasks.ts");
		expect(plain(draft)).toMatch(/do not ask a model to invent/i);
		expect(referenceDocs).toContain("generate-tasks.ts");
	});

	test("scripted skips are recorded even when profiling is off", () => {
		for (const skill of [draft, executeScriptedEdit, addressCommentsFlow, groom]) {
			expect(skill).toContain("record-skip.ts");
			expect(skill).toContain("routing-scorecard.ts");
			expect(plain(skill)).toMatch(/never estimates tokens saved/i);
		}
		expect(codeReviewMax).toContain("record-skip.ts");
		expect(releaseReadiness).toContain("record-skip.ts");
		expect(runtime).toContain("record-skip.ts");
		expect(plain(runtime)).toMatch(/never estimates tokens saved/i);
		expect(plain(rootReadme)).toMatch(/never estimates tokens saved/i);
		expect(plain(referenceDocs)).toMatch(/never estimates tokens saved/i);
	});

	test("record-routing persist always supplies an explicit outcome file", () => {
		expect(draft).toContain("author-outcome.json");
		expect(executeFlow).toContain("implement-outcome.json");
		expect(executeFlow).toContain("review-outcome.json");
		expect(addressCommentsFlow).toContain("classify-outcome.json");
		expect(runtime).toMatch(/explicit outcome/);
	});

	test("stages capture wall time automatically and never invent token counts", () => {
		for (const skill of [draft, executeFlow, addressCommentsFlow]) {
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
		expect(executeFlow).toContain("implement-usage-timer.json");
		expect(executeFlow).toContain("review-usage-timer.json");
		expect(draft).toContain("author-usage-timer.json");
		expect(addressCommentsFlow).toContain("classify-usage-timer.json");
	});

	test("run scorecards do not present shadow recommendations as measured savings", () => {
		for (const skill of [draft, executeFlow, addressCommentsFlow]) {
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
		for (const skill of [executeReEntry, addressCommentsFlow]) {
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
			expect(skill).toContain('"${FACTORY_ROOT}/runtime-manifest.json"');
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
		expect(claudeAdapter).toMatch(/BUN_OPTIONS/);
		expect(claudeAdapter).toMatch(/claude daemon stop --any/);
	});

	test("Cursor hook targets the real commit-guard script", () => {
		const hooks = JSON.parse(cursorHooks) as {
			hooks: {
				beforeShellExecution: Array<{ command: string; failClosed?: boolean }>;
			};
		};
		expect(hooks.hooks.beforeShellExecution[0]?.command).toBe(
			'bun "$DELIVERY_FACTORY_ROOT/scripts/commit-guard.ts" --protocol cursor',
		);
		expect(hooks.hooks.beforeShellExecution[0]?.failClosed).toBe(true);
		expect(cursorAdapter).toMatch(/hooks\.json/i);
		expect(cursorAdapter).toMatch(/enforced only after setup verifies/i);
	});
});

describe("generic work-item selection", () => {
	test("delivery confirms one repository provider before lifecycle work", () => {
		expect(delivery).toContain("work-item-config.ts");
		expect(delivery).toContain("`reference/work-item-choice.md`");
		expect(deliveryWorkItemChoice).toContain("local-files");
		expect(deliveryWorkItemChoice).toMatch(
			/Never infer from remotes, credentials, host/i,
		);
		expect(deliveryWorkItemChoice).toContain("--replace");
		expect(delivery).toMatch(/Human decision brief/);
	});

	test("groom and draft route through provider-neutral handoffs", () => {
		expect(groom).toMatch(/confirmed\s+work-item provider/i);
		expect(groom).not.toMatch(/copy the content into the tracker manually/i);
		expect(draft).toMatch(/confirmed provider/i);
		expect(draft).toContain("work-item-provider.ts");
		expect(draft).toMatch(/Never read a provider file or call[\s\S]*directly/i);
		expect(execute).toContain("work-item-provider.ts");
		expect(addressComments).toContain("work-item-provider.ts");
		expect(read("../skills/delivery/workflows/epic-to-backlog.md")).toContain(
			"work-item-provider.ts",
		);
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

describe("normalized forge workflow commands", () => {
	const genericDocs = [
		["execute", execute],
		["execute re-entry", executeReEntry],
		["execute verdict routes", executeVerdictRoutes],
		["address-comments", addressComments],
		["code-review-max", codeReviewMax],
		["mr-review", mrReview],
		["delivery", delivery],
		["ticket-to-mr", ticketToMr],
		["mr-review-to-ready", mrReviewToReady],
		["release-readiness", releaseReadiness],
		["NOTES", notes],
		["delivery-orchestrator", orchestrator],
		["RUNTIME", runtime],
		["CONVENTIONS", conventions],
	] as const;

	test("generic skills and docs never name a provider-native forge helper", () => {
		for (const [name, doc] of genericDocs) {
			expect([name, PROVIDER_NATIVE.test(doc)]).toEqual([name, false]);
		}
	});

	test("execute finds, creates, and notes through exact forge-provider calls", () => {
		expect(executeReEntry).toContain(`${FORGE_PROVIDER} find`);
		expect(execute).toContain(`${FORGE_PROVIDER} create`);
		expect(execute).toContain(`${FORGE_PROVIDER} note`);
		expect(execute).toContain('"${FACTORY_ROOT}/runtime-manifest.json"');
		expect(plain(execute)).toMatch(
			/never merges?, closes?, or resolves? threads/i,
		);
	});

	test("address-comments finds, drafts, reads discussions, and replies through exact calls", () => {
		expect(addressComments).toContain(`${FORGE_PROVIDER} find`);
		expect(addressComments).toContain(`${FORGE_PROVIDER} set-draft`);
		expect(addressComments).toContain(`${FORGE_PROVIDER} discussions`);
		expect(addressComments).toContain(`${FORGE_PROVIDER} reply`);
		expect(addressComments).toMatch(/One call per thread/i);
		expect(addressComments).toMatch(/Never.*mark any thread resolved/i);
		expect(plain(addressComments)).toMatch(
			/never merge, close, or resolve threads/i,
		);
	});

	test("code-review-max pins evidence with read, files, and diff before commits", () => {
		const readAt = codeReviewMax.indexOf(`${FORGE_PROVIDER} read`);
		const filesAt = codeReviewMax.indexOf(`${FORGE_PROVIDER} files`);
		const diffAt = codeReviewMax.indexOf(`${FORGE_PROVIDER} diff`);
		const commitsAt = codeReviewMax.indexOf(`${FORGE_PROVIDER} commits`);
		expect(readAt).toBeGreaterThan(-1);
		expect(filesAt).toBeGreaterThan(readAt);
		expect(diffAt).toBeGreaterThan(filesAt);
		expect(commitsAt).toBeGreaterThan(diffAt);
		expect(codeReviewMax).toMatch(/Never review a partial diff/);
		expect(codeReviewMax).toContain(
			"Do not publish findings through the forge provider.",
		);
	});

	test("mr-review preserves evidence order and per-note dry-run then approval", () => {
		const phase1 = mrReview.slice(
			mrReview.indexOf("## Phase 1"),
			mrReview.indexOf("## Phase 2"),
		);
		const readAt = phase1.indexOf(`${FORGE_PROVIDER} read`);
		const commitsAt = phase1.indexOf(`${FORGE_PROVIDER} commits`);
		const discussionsAt = phase1.indexOf(`${FORGE_PROVIDER} discussions`);
		const filesAt = phase1.indexOf(`${FORGE_PROVIDER} files`);
		expect(readAt).toBeGreaterThan(-1);
		expect(commitsAt).toBeGreaterThan(readAt);
		expect(discussionsAt).toBeGreaterThan(commitsAt);
		expect(filesAt).toBeGreaterThan(discussionsAt);
		expect(phase1).not.toContain(`${FORGE_PROVIDER} diff`);
		expect(mrReview).toContain(
			"Do not run `forge-provider.ts` `diff` during this phase",
		);
		expect(mrReview).toContain(`${FORGE_PROVIDER} diff`);
		expect(mrReview).toContain(`${FORGE_PROVIDER} anchors`);
		expect(mrReview).toContain('"dryRun": true');
		expect(mrReview).toContain('must not set `"approved": true`');
		expect(mrReview).toContain('"approved": true');
		expect(mrReview).toMatch(/summary\.md` first/i);
		expect(mrReview).toMatch(
			/Each `note` call raises its own prompt[\s\S]*If one fails/i,
		);
		expect(mrReview).toMatch(/Never merge, close, or resolve threads/);
	});

	test("delivery and stage workflows route forge I/O through forge-provider.ts", () => {
		expect(delivery).toContain("scripts/forge-provider.ts");
		expect(mrReviewToReady).toContain(`${FORGE_PROVIDER} read`);
		expect(mrReviewToReady).toMatch(/per-note prompts/i);
		expect(releaseReadiness).toContain(`${FORGE_PROVIDER} read`);
		expect(runtime).toContain(
			'bun "$FACTORY_ROOT/scripts/forge-provider.ts" <operation> <repoRoot>',
		);
		expect(runtime).toContain('forge-provider.ts" plan');
		expect(runtime).toContain('forge-provider.ts" normalize');
		expect(conventions).toContain("scripts/forge-provider.ts");
		expect(conventions).toMatch(/unplanned host tool/i);
	});
});

describe("diff surface scan", () => {
	const scan = 'diff-scan.ts" <base-sha> <head-sha>';

	test("release readiness classifies from the scan and keeps every mark", () => {
		const readiness = plain(releaseReadiness);
		expect(releaseReadiness).toContain(scan);
		expect(readiness).toMatch(/non-zero exit stops the stage/i);
		expect(readiness).toMatch(/never remove a scanned one/i);
		expect(readiness).toMatch(/oneWay signal makes the change a one-way door/i);
		expect(readiness).toMatch(/start from the scan's loweredBar hits/i);
	});

	test("code-review-max takes the scanned surfaces as a floor", () => {
		const maxReview = plain(codeReviewMax);
		expect(codeReviewMax).toContain(scan);
		expect(maxReview).toMatch(/never remove a scanned one/i);
		expect(maxReview).toMatch(/oneWay signal makes the change one-way/i);
	});

	test("the script is named in the conventions and runtime notes", () => {
		expect(conventions).toContain("scripts/diff-scan.ts");
		expect(runtime).toContain('scripts/diff-scan.ts" <base> <head>');
	});
});

describe("release-readiness lens tier", () => {
	test("lens subagents resolve standard and the conductor still decides", () => {
		const readiness = plain(releaseReadiness);
		expect(releaseReadiness).toContain(
			'scripts/model-catalogue.ts" resolve standard',
		);
		expect(readiness).toMatch(
			/pass that exact model identifier to every lens subagent/i,
		);
		expect(readiness).toMatch(/main conversation still decides GO or NO-GO/i);
		expect(readiness).toMatch(/review-fanout\.ts" readiness/i);
		expect(readiness).toMatch(
			/empty.*do not dispatch lens\s+subagents and do not run the rollback lens yourself/i,
		);
		expect(readiness).toMatch(
			/small.*skip the subagents in step 3 and\s+run the rollback lens yourself/i,
		);
		expect(readiness).toMatch(/do not dispatch a fast model for these lenses/i);
		expect(readiness).toMatch(
			/missing live standard candidate stops the stage/i,
		);
	});

	test("operator docs name the same standard-tier rule", () => {
		for (const document of [
			conventions,
			runtime,
			workflowDocs,
			referenceDocs,
			rootReadme,
		]) {
			expect(plain(document)).toMatch(
				/release-readiness lens subagents.*standard/i,
			);
			expect(plain(document)).toMatch(/GO or NO-GO/i);
		}
	});
});

test("a factory change always squashes its commits on merge", () => {
	expect(execute).toMatch(/always squashes its commits on merge/);
	expect(conventions).toMatch(
		/Every factory change squashes its commits on merge/,
	);
});

describe("board status sync", () => {
	const [script, subcommand] = BOARD_SYNC_INVOCATION.split(" ");
	const call = new RegExp(
		`bun "\\$\\{FACTORY_ROOT\\}/${script}" ${subcommand} "<repoRoot>" "\\$\\{FACTORY_ROOT\\}/runtime-manifest\\.json" <work-item-key> ([a-z-]+)`,
		"g",
	);
	const phasesIn = (text: string) =>
		[...text.matchAll(call)].map((match) => match[1] ?? "");
	const verify = read("../skills/delivery/workflows/post-merge-verify.md");

	test("each stage syncs only its own phases", () => {
		expect(phasesIn(draft)).toEqual(["ready"]);
		expect(phasesIn(execute)).toEqual(["in-progress", "in-review"]);
		expect(phasesIn(verify)).toEqual(["done"]);
		expect(phasesIn(addressComments)).toEqual([]);
		for (const phase of [draft, execute, verify].flatMap(phasesIn)) {
			expect(SDLC_BOARD_PHASES as readonly string[]).toContain(phase);
		}
	});

	test("a skipped or failed sync never blocks the stage", () => {
		for (const text of [draft, execute, verify]) {
			expect(plain(text)).toMatch(
				/A skipped sync prints its reason; name it in the stage summary and continue\. A non-zero exit is a provider failure: report it in plain words and continue\./,
			);
		}
		expect(verify).toMatch(/on a verified result only/);
	});

	test("init proposes and confirms the board map with the operator", () => {
		for (const invocation of [
			BOARD_PROPOSE_INVOCATION,
			BOARD_CONFIRM_INVOCATION,
		]) {
			const [path, command] = invocation.split(" ");
			expect(setup).toContain(`bun "\${FACTORY_ROOT}/${path}" ${command}`);
		}
		expect(setup).toMatch(
			/Never pick a column for\s+an unresolved phase yourself/,
		);
	});

	test("closing, reopening, and backwards moves stay human-owned", () => {
		expect(conventions).toMatch(
			/Humans own closing, reopening, deleting, and backwards moves/,
		);
		expect(addressComments).toMatch(/NEVER moves the ticket here/);
	});
});

describe("auto lands approved, green changes through the land gate", () => {
	const contract = plain(auto);

	test("auto names the land command, every gate check, and its outcomes", () => {
		expect(auto).toContain('scripts/forge-provider.ts" land');
		for (const check of [
			/open and not a draft/,
			/approved by at least one person with every approval rule met/,
			/latest pipeline passed/,
			/no conflicts/,
			/no comment readiness did not see/,
			/readiness GO at that head/,
			/continuous-delivery: yes/,
			/permits change-land for the ticket/,
		]) {
			expect(contract).toMatch(check);
		}
		expect(contract).toMatch(/Exit 0 is landed.*3 is wait.*1 is stop/);
		expect(auto).toMatch(
			/\| `\[go !N\]` \| Before landing, read the comments on the change again, then land it/,
		);
		expect(contract).toMatch(/kind: "archive"/);
		expect(contract).toMatch(/outside openspec\//);
		expect(contract).toMatch(/never merge any other way/i);
	});

	test("every other merge stays a person's", () => {
		expect(contract).toMatch(/not authorization to merge any other way/);
		expect(contract).toMatch(
			/with session tools only, the merge stays the operator's/i,
		);
		expect(delivery).toContain("forge-provider.ts land");
		expect(plain(conventions)).toMatch(/merges only through the land gate/);
		expect(plain(rootReadme)).toMatch(/Human approves; auto lands/);
		expect(plain(runtime)).toMatch(/never through session tools/);
	});

	test("operation lists in the docs name every normalized forge operation", () => {
		for (const doc of [runtime, rootReadme, referenceDocs]) {
			for (const operation of FORGE_OPERATIONS) {
				expect(doc).toContain(`\`${operation}\``);
			}
		}
	});
});

test("auto closes worker worktrees only through worktree-close", () => {
	const contract = plain(auto);
	expect(auto).toContain('scripts/worktree-close.ts" <worktree-path>');
	expect(WORKTREE_CLOSE_INVOCATION).toStartWith(
		"scripts/worktree-close.ts <worktree-path>",
	);
	expect(contract).toMatch(/never remove a worktree any other way/i);
	for (const doc of [auto, ledger]) {
		expect(doc).toContain("kept worktree <path> for <KEY>: <reasons>");
	}
	expect(plain(ledger)).toMatch(/\/delivery status lists every kept worktree/);
});

test("worker worktrees get only the local files the operator confirmed", () => {
	expect(auto).toContain('scripts/worktree-files.ts" copy <repoRoot> <path>');
	expect(plain(auto)).toMatch(/Never copy other files into a worktree/);
	expect(setup).toContain('scripts/worktree-files.ts" propose "<repoRoot>"');
	expect(setup).toContain(
		'scripts/worktree-files.ts" confirm "<repoRoot>" <worktree-files.json>',
	);
	expect(plain(setup)).toMatch(/never show their contents/);
	for (const invocation of [
		WORKTREE_FILES_PROPOSE_INVOCATION,
		WORKTREE_FILES_CONFIRM_INVOCATION,
		WORKTREE_FILES_COPY_INVOCATION,
	]) {
		expect(referenceDocs.replace(/"\$FACTORY_ROOT\/([^"]+)"/g, "$1")).toContain(
			invocation,
		);
	}
	expect(referenceDocs).toContain(WORKTREE_FILES_PATH);
});

test("auto stops idle workers from their journal heartbeat", () => {
	const contract = plain(auto);
	expect(auto).toContain(
		'scripts/worker-watch.ts" <workers-dir> <dispatch.json>',
	);
	expect(WORKER_WATCH_INVOCATION).toBe(
		"scripts/worker-watch.ts <workers-dir> <dispatch.json>",
	);
	expect(contract).toContain(`default ${DEFAULT_WORKER_IDLE_MINUTES}`);
	expect(contract).toMatch(/WORKER_IDLE_MINUTES/);
	expect(contract).toMatch(/\[stopped: <reason>\] with the reason worker idle/);
	expect(contract).toMatch(/ignore anything it writes afterwards/);
	expect(contract).toMatch(/Its siblings keep running/);
	expect(plain(ledger)).toMatch(
		/applies nothing that worker writes afterwards/,
	);
	expect(referenceDocs).toContain(
		`\`WORKER_IDLE_MINUTES\` | Minutes without a journal write before auto stops a parallel worker as idle (\`scripts/config.ts\`, default ${DEFAULT_WORKER_IDLE_MINUTES})`,
	);
});

test("auto runs workers in the confirmed sandbox and never silently without it", () => {
	const contract = plain(auto);
	expect(auto).toContain('scripts/sandbox-run.ts" check <repoRoot>');
	expect(auto).toContain(
		'scripts/sandbox-run.ts" run <repoRoot> <path> <state-root> <run-id> <KEY>',
	);
	expect(auto).toContain(
		'scripts/sandbox-run.ts" stop <repoRoot> <run-id> <KEY>',
	);
	expect(contract).toMatch(
		/Never fall back to plain worktrees when a sandbox was confirmed/,
	);
	expect(setup).toContain(
		'scripts/sandbox-run.ts" confirm "<repoRoot>" <sandbox.json>',
	);
	expect(plain(setup)).toMatch(/never their values/);
	const reference = referenceDocs.replace(/"\$FACTORY_ROOT\/([^"]+)"/g, "$1");
	for (const invocation of [
		SANDBOX_CONFIRM_INVOCATION,
		SANDBOX_CHECK_INVOCATION,
		SANDBOX_RUN_INVOCATION,
		SANDBOX_STOP_INVOCATION,
	]) {
		expect(reference).toContain(invocation);
	}
	expect(referenceDocs).toContain(SANDBOX_PATH);
	expect(plain(referenceDocs)).toContain(`at most ${MAX_SANDBOX_ENV}`);
	expect(plain(referenceDocs)).toContain(`up to ${MAX_SANDBOX_SETUP}`);
	for (const engine of SANDBOX_ENGINES) {
		expect(referenceDocs).toContain(`\`${engine}\``);
		expect(setup).toContain(`\`${engine}\``);
	}
});

test("the docs state each level's values from the level table and its fixed floors", () => {
	expect(plain(delivery)).toContain(
		"Read reference/levels.md when the arguments name a level word",
	);
	const levels = deliveryLevels;
	for (const level of DELIVERY_LEVELS) {
		const settings = LEVEL_SETTINGS[level];
		const row = levels
			.split("\n")
			.find((line) => line.startsWith(`| \`${level}\` |`));
		expect(row).toBeDefined();
		const cells = (row ?? "").split("|").map((cell) => cell.trim());
		expect(cells.slice(2, 5)).toEqual([
			String(settings.maxParallelWorktrees),
			String(settings.maxFixAttempts),
			String(settings.maxReviewRounds),
		]);
	}
	const floors = plain(levels);
	for (const floor of [
		/holdout review/,
		/frontier model for review/,
		/sensitive surface, changes a dependency, is one-way, or was not fully classified/,
		/release-readiness lenses/,
		/land gate/,
		/fast models stay evaluation-only/,
		/any human-owned decision/,
	]) {
		expect(floors).toMatch(floor);
	}
	expect(delivery).toContain(
		'scripts/sdlc-constitution.ts" level <run-contract.json> [requested-level]',
	);
	expect(CONSTITUTION_LEVEL_INVOCATION).toBe(
		"scripts/sdlc-constitution.ts level <run-contract.json> [requested-level]",
	);
	expect(plain(delivery)).toMatch(/two level words is a stop/);
	const contract = plain(auto).replace(/\s+([,;.)])/g, "$1");
	expect(contract).toContain(
		`MAX_REVIEW_ROUNDS, default ${DEFAULT_MAX_REVIEW_ROUNDS}; the run level sets ${LEVEL_SETTINGS.min.maxReviewRounds} at min and ${LEVEL_SETTINGS.max.maxReviewRounds} at max`,
	);
	expect(contract).toContain(
		`default ${DEFAULT_MAX_PARALLEL_WORKTREES}; the run level sets ${LEVEL_SETTINGS.min.maxParallelWorktrees} at min and ${LEVEL_SETTINGS.max.maxParallelWorktrees} at max`,
	);
	expect(contract).toMatch(
		/<maxReviewRounds> review rounds without a ready verdict/,
	);
	expect(contract).not.toMatch(/Three review rounds/);
	expect(auto).toContain("DELIVERY_LEVEL=<the run's level>");
	for (const name of ["DELIVERY_LEVEL", "MAX_REVIEW_ROUNDS"]) {
		expect(referenceDocs).toContain(`| \`${name}\` |`);
	}
	expect(conventions).toContain(
		`MAX_REVIEW_ROUNDS\` default ${DEFAULT_MAX_REVIEW_ROUNDS}`,
	);
});

test("every operator page that tabulates levels copies the level table exactly", () => {
	const levelSection = (doc: string, heading: string) => {
		const start = doc.indexOf(`\n${heading}\n`);
		expect(start).toBeGreaterThan(-1);
		const depth = heading.split(" ")[0] ?? "##";
		const end = doc.indexOf(`\n${depth} `, start + 1);
		return doc.slice(start, end < 0 ? undefined : end);
	};
	const rows = (section: string) =>
		DELIVERY_LEVELS.map((level) => {
			const row = section
				.split("\n")
				.find((line) => line.startsWith(`| \`${level}\` |`));
			expect(row).toBeDefined();
			return (row ?? "").split("|").map((cell) => cell.trim());
		});
	const canonical = rows(deliveryLevels);
	const troubleshooting = read("../docs/troubleshooting.md");
	const examples = read("../docs/examples.md");
	const gettingStarted = read("../docs/getting-started.md");
	for (const [doc, heading] of [
		[rootReadme, "## Levels"],
		[workflowDocs, "## Levels"],
	] as const) {
		const copied = rows(levelSection(doc, heading));
		expect(copied).toEqual(canonical);
		for (const [index, level] of DELIVERY_LEVELS.entries()) {
			const settings = LEVEL_SETTINGS[level];
			expect(copied[index]?.slice(2, 5)).toEqual([
				String(settings.maxParallelWorktrees),
				String(settings.maxFixAttempts),
				String(settings.maxReviewRounds),
			]);
		}
	}
	const readmeLevels = plain(levelSection(rootReadme, "## Levels"));
	for (const floor of [
		/Holdout review, the \/code-review-max and \/mr-review chain, and the frontier model for review/,
		/changes a dependency, is one-way, or was not fully classified/,
		/Release-readiness lenses, the readiness GO and its rollback plan, and the land gate/,
		/Fast models stay evaluation-only/,
	]) {
		expect(readmeLevels).toMatch(floor);
	}
	for (const name of [
		"MAX_PARALLEL_WORKTREES",
		"MAX_FIX_ATTEMPTS",
		"MAX_REVIEW_ROUNDS",
	]) {
		expect(readmeLevels).toContain(name);
	}
	const caps = `default ${DEFAULT_MAX_PARALLEL_WORKTREES}, ${LEVEL_SETTINGS.min.maxParallelWorktrees} at min and ${LEVEL_SETTINGS.max.maxParallelWorktrees} at max`;
	expect(plain(rootReadme)).toContain(caps);
	expect(plain(workflowDocs)).toContain(caps);
	for (const command of [
		"/delivery auto max docs/prd/billing.md",
		"/delivery auto min ABC-1234",
		"/delivery min ABC-5678",
	]) {
		expect(rootReadme).toContain(command);
		expect(workflowDocs).toContain(command);
	}
	expect(gettingStarted).toContain(
		"/delivery auto max <idea, PRD path, or key>",
	);
	expect(examples).toContain("## Choosing a level");
	expect(classifyEntry("auto max docs/prd/billing.md")).toMatchObject({
		kind: "explicit-verb",
		verb: "auto",
		level: "max",
	});
	expect(classifyEntry("execute max ABC-91")).toMatchObject({
		kind: "explicit-verb",
		verb: "execute",
		level: "max",
	});
	const changed = contractLevel(
		freezeAgainstLiveConstitution({
			version: 1,
			runId: "docs-level",
			planVersion: 1,
			goal: "g",
			scope: ["s"],
			nonGoals: [],
			tickets: [{ key: "ABC-1", title: "t", acceptance: ["a"], blockedBy: [] }],
			permittedWrites: ["implementation"],
			humanOwned: [...loadConstitution().document.humanOwned],
			approval: { who: "o", words: "yes", at: "2026-10-30T00:00:00.000Z" },
			level: "min",
		}),
		"max",
	);
	const quoted = changed.reason?.split(";")[0] ?? "";
	expect(quoted).toBe("this run was approved at the min level");
	for (const doc of [rootReadme, troubleshooting]) {
		expect(plain(doc)).toContain(quoted);
	}
	expect(() => splitLevel("max min ABC-1", new Set())).toThrow(
		"Name one delivery level, not two.",
	);
	expect(troubleshooting).toContain('"Name one delivery level, not two"');
	expect(() => parseLevel("turbo")).toThrow(/^unknown delivery level/);
	expect(troubleshooting).toContain('"Unknown delivery level"');
});

test("review rounds stop patching a repeated assumption and fold formatting and spec edits into the fix", () => {
	const assessor = read("agents/comment-assessor.md");
	const flowing = plain(addressComments);
	expect(addressComments).toContain(
		'scripts/review-rounds.ts" record "<repoRoot>/.review/<changeName>/review-rounds.json" "<reviewDir>/classification.json" <full-head-sha>',
	);
	expect(addressCommentsFlow).toContain(
		'scripts/review-rounds.ts" premise "<repoRoot>/.review/<changeName>/review-rounds.json" <assumption> <outcome.md>',
	);
	const reference = referenceDocs.replace(/"\$FACTORY_ROOT\/([^"]+)"/g, "$1");
	for (const invocation of [
		REVIEW_ROUNDS_RECORD_INVOCATION,
		REVIEW_ROUNDS_PREMISE_INVOCATION,
	]) {
		expect(reference).toContain(invocation);
	}
	expect(flowing).toMatch(/Exit 3: the printed repeated labels/);
	expect(flowing).toMatch(/Exit 1: the approach was already re-examined/);
	expect(flowing).toMatch(/Never add a formatting-only or spec-only commit/);
	expect(flowing).toMatch(/Formatting and spec updates go in the fix commit/);
	expect(plain(execute)).toMatch(/formatting is never a commit of its own/);
	expect(plain(auto)).toMatch(
		/review-rounds\.ts ?, in auto and in single steps/,
	);
	expect(assessor).toContain('"assumption": "kebab-case-label, only on a bug"');
	expect(plain(assessor)).toMatch(/reuse its exact label/);
});

test("a comment round runs gates only, later reviews read only what changed, and draft challenges the approach", () => {
	const reviewMax = read("../skills/code-review-max/SKILL.md");
	const secondPass = read("../skills/mr-review/SKILL.md");
	const challenger = read("agents/approach-challenger.md");
	const reference = referenceDocs.replace(/"\$FACTORY_ROOT\/([^"]+)"/g, "$1");
	expect(REVIEW_SCOPE_INVOCATION).toBe(
		"scripts/review-scope.ts <repoRoot> <iid> <base-sha> <head-sha>",
	);
	expect(reviewMax).toContain(
		'scripts/review-scope.ts" "<repoRoot>" <ref> <full-base-sha> <full-head-sha>',
	);
	expect(reference).toContain(REVIEW_SCOPE_INVOCATION);
	expect(plain(reviewMax)).toMatch(
		/confirm whether each earlier finding is fixed at this head/,
	);
	expect(plain(reviewMax)).toMatch(/never narrows release readiness/);
	expect(plain(secondPass)).toMatch(/review-scope\.json says delta/);
	expect(plain(addressComments)).toMatch(
		/this round runs no review of its own/i,
	);
	expect(addressComments).not.toMatch(/holdout-reviewer/);
	expect(draft).toContain(
		'scripts/draft-route.ts" approach "<reviewDir>/approach-challenge-<attempt>.json" <attempt>',
	);
	expect(reference).toContain(
		"scripts/draft-route.ts approach <verdict.json> <attempt>",
	);
	expect(plain(draft)).toMatch(
		/complexitySignal is low , skip this step|complexitySignal is low, skip this step/,
	);
	expect(plain(draft)).toMatch(/Do not challenge again/);
	expect(SKIPPED_WORKERS).toContain("approach-challenger");
	expect(challenger).toMatch(
		/^---[\s\S]*model: opus[\s\S]*tools: Read, Grep, Glob/,
	);
	expect(MAX_APPROACH_CHALLENGES).toBe(2);
	const constitution = JSON.parse(
		read("../skills/delivery/sdlc-constitution.json"),
	) as { stages: Record<string, { stops: string[] }> };
	expect(constitution.stages["address-comments"]?.stops).not.toContain(
		"holdout-rejected",
	);
	expect(constitution.stages.draft?.stops).toContain("unsettled-approach");
});

test("the review skills run review memory through the script's own invocations, in order", () => {
	expect(REVIEW_MEMORY_RECORD_INVOCATION).toBe(
		"scripts/review-memory.ts record <repoRoot> <iid> <head-sha> <outcome.json>",
	);
	expect(REVIEW_MEMORY_FILTER_INVOCATION).toBe(
		"scripts/review-memory.ts filter <repoRoot> <iid> <head-sha> <candidates.json>",
	);
	const skill = codeReviewMax.replace(/"(<[^">]+>)"/g, "$1");
	const inSkill = (invocation: string) =>
		`bun "\${FACTORY_ROOT}/${invocation.replace(/^(\S+) /, '$1" ')}`;
	const filterAt = skill.indexOf(inSkill(REVIEW_MEMORY_FILTER_INVOCATION));
	const recordAt = skill.indexOf(inSkill(REVIEW_MEMORY_RECORD_INVOCATION));
	const adjudicationAt = skill.indexOf('review-fanout.ts" adjudication');
	const lastStepAt = skill.indexOf("could be shorter");
	for (const at of [filterAt, recordAt, adjudicationAt, lastStepAt]) {
		expect(at).toBeGreaterThan(-1);
	}
	expect(skill.indexOf("## Parallel review")).toBeLessThan(filterAt);
	expect(filterAt).toBeLessThan(adjudicationAt);
	expect(adjudicationAt).toBeLessThan(lastStepAt);
	expect(lastStepAt).toBeLessThan(recordAt);
	expect(recordAt).toBeLessThan(skill.indexOf("\n## Output"));

	const packetCommand = skill
		.split("\n")
		.find((line) =>
			line.includes('bun "${FACTORY_ROOT}/scripts/review-packet.ts"'),
		);
	expect(packetCommand).toMatch(/--evidence \S*memory-filter\.json --out /);
});

test("the reference carries both review memory invocations and the memory file the script writes", () => {
	const reference = referenceDocs.replace(/"\$FACTORY_ROOT\/([^"]+)"/g, "$1");
	expect(reference).toContain(REVIEW_MEMORY_RECORD_INVOCATION);
	expect(reference).toContain(REVIEW_MEMORY_FILTER_INVOCATION);
	const source = readFileSync(
		join(import.meta.dir, "review-memory.ts"),
		"utf8",
	);
	expect(source).toContain("rejected.json");
	expect(reference).toContain("rejected.json");
});

test("the reference carries the needs-validation invocation and the acknowledgement phrase the script reads", () => {
	const reference = referenceDocs.replace(/"\$FACTORY_ROOT\/([^"]+)"/g, "$1");
	expect(reference).toContain(NEEDS_VALIDATION_CHECK_INVOCATION);
	expect(reference).toContain(NEEDS_VALIDATION_ACK_PHRASE);
});

test("the operator docs say a needs-validation item stays open until a person acknowledges it", () => {
	for (const document of [rootReadme, workflowDocs, referenceDocs]) {
		const text = plain(document);
		expect(text).toMatch(/needs-validation/i);
		expect(text).toMatch(/acknowledg/i);
	}
	expect(plain(referenceDocs)).toMatch(
		/risk acceptance and `?continuous-delivery: yes`? do not clear an item/i,
	);
});

test("the dropped-candidate list and the memory files belong to the two review skills only", () => {
	const skills = join(ROOT, "..", "skills");
	const others = readdirSync(skills).filter(
		(name) =>
			name !== "code-review-max" &&
			name !== "mr-review" &&
			existsSync(join(skills, name, "SKILL.md")),
	);
	expect(others.length).toBeGreaterThan(0);
	for (const name of others) {
		const text = read(`../skills/${name}/SKILL.md`);
		for (const copied of [
			"Previously disproved",
			"rejected.json",
			"memory-filter.json",
			"memory-outcome.json",
		]) {
			expect([name, text.includes(copied)]).toEqual([name, false]);
		}
	}
});

test("every page that describes review memory says it is for one merge request, lives under .review, and does not track fixed findings", () => {
	const windows = (doc: string) => {
		const found: string[] = [];
		for (const match of doc.matchAll(/disproved|rejection/gi)) {
			const at = match.index ?? 0;
			found.push(doc.slice(Math.max(0, at - 700), at + 700));
		}
		return plain(found.join("\n"));
	};
	for (const [name, doc] of [
		["docs/reference.md", referenceDocs],
		["docs/workflow.md", workflowDocs],
		["mr-review-to-ready.md", mrReviewToReady],
		["code-review-max/SKILL.md", codeReviewMax],
	] as const) {
		const text = windows(doc);
		expect([name, text.length > 0]).toEqual([name, true]);
		expect([
			name,
			/(same|one|a single|each) (merge request|MR|change)/i.test(text),
		]).toEqual([name, true]);
		expect([name, text.includes(".review/")]).toEqual([name, true]);
		expect([name, /fresh clone|another runtime/i.test(text)]).toEqual([
			name,
			true,
		]);
		expect([
			name,
			/(does not|do not|never) track(s|ing)? fixed|not track(ing)? fixed|fixed findings/i.test(
				text,
			),
		]).toEqual([name, true]);
	}
});

test("the operator docs walk through the current review loop with the real script names", () => {
	const examples = read("../docs/examples.md");
	for (const script of ["review-scope.ts", "review-rounds.ts"]) {
		expect(existsSync(join(import.meta.dir, script))).toBe(true);
		expect(workflowDocs).toContain(script);
	}
	expect(examples).toContain("review-scope.ts");
	expect(existsSync(join(ROOT, "agents", "approach-challenger.md"))).toBe(true);
	expect(rootReadme).toContain("### How one ticket moves");
	expect(rootReadme).toContain('challenge["Challenge the approach"]');
	expect(rootReadme).toContain(
		'address -->|"cumulative gates, no review"| review',
	);
	expect(plain(rootReadme)).toMatch(
		/runs tests, lint, and typecheck across the whole branch, and no review of its own/,
	);
	expect(workflowDocs).toContain("## Review loop");
	expect(plain(workflowDocs)).toMatch(
		/Address comments \| A test commit and a fix commit per bug/,
	);
	expect(examples).toContain("## A review round, start to finish");
	for (const doc of [rootReadme, workflowDocs]) {
		expect(plain(doc)).not.toMatch(/cumulative (?:Opus |frontier )?holdout/i);
	}
});

test("the docs describe the reviewer settle check with its real knobs and command", () => {
	const readiness = read("../skills/delivery/workflows/release-readiness.md");
	const gitlab = read("../providers/gitlab/README.md");
	expect(REVIEWER_SETTLE_INVOCATION).toBe(
		"scripts/reviewer-settle.ts <change.json> <discussions.json> <approvals.json>",
	);
	expect(readiness).toContain(
		'scripts/reviewer-settle.ts" <change.json> <discussions.json> <approvals.json>',
	);
	for (const name of [
		"REVIEW_SETTLE_MINUTES",
		"REVIEW_QUIET_HOURS",
		"REVIEW_TIMEZONE",
		"DELIVERY_FACTORY_AUTHORS",
	]) {
		expect(referenceDocs).toContain(`| \`${name}\` |`);
	}
	expect(referenceDocs).toContain(`default ${DEFAULT_REVIEW_SETTLE_MINUTES})`);
	expect(plain(auto).replace(/\s+([,;.)])/g, "$1")).toContain(
		`REVIEW_SETTLE_MINUTES, default ${DEFAULT_REVIEW_SETTLE_MINUTES}`,
	);
	expect(plain(auto)).toMatch(/reviewers have settled/);
	expect(plain(rootReadme)).toMatch(
		/readiness gave GO, and reviewers have settled/,
	);
	expect(plain(gitlab)).toMatch(/is the GitLab username/);
});

test("the worker and review-round caps are enforced by scripts the docs name", () => {
	expect(REVIEW_ROUNDS_ALLOW_INVOCATION).toBe(
		"scripts/review-rounds.ts allow <review-rounds.json> <round> <approval.json>",
	);
	expect(auto).toContain(
		'scripts/review-rounds.ts" allow <review-rounds.json> <round> <approval.json>',
	);
	expect(referenceDocs.replace(/"\$FACTORY_ROOT\/([^"]+)"/g, "$1")).toContain(
		REVIEW_ROUNDS_ALLOW_INVOCATION,
	);
	expect(auto).toContain(
		`scripts/config.ts" ready-wave '<keys-json>' <state-root>/workers/<run-id>/dispatch.json <ledger.md>`,
	);
	expect(auto.replace(/\s+/g, " ")).toContain(
		`When those reach \`maxAwaitingReview\` (\`MAX_AWAITING_REVIEW\`, default ${DEFAULT_MAX_AWAITING_REVIEW}) it starts no more work`,
	);
	expect(plain(auto)).toMatch(/Never raise the limit yourself/);
	expect(referenceDocs).toContain(
		`(\`scripts/config.ts\`, default ${DEFAULT_MAX_AWAITING_REVIEW}) |`,
	);
	expect(plain(auto)).toMatch(
		/Set a worker's finishedAt when the coordinator reconciles its result or stops it/,
	);
	expect(plain(addressComments)).toMatch(
		/past the run's review-round limit without a recorded approval/,
	);
});

test("test-gap comments get a mutation proof instead of a red gate, and bugs keep the red gate", () => {
	const assessor = read("agents/comment-assessor.md");
	expect(MUTATION_PROOF_INVOCATION).toBe(
		"scripts/mutation-proof.ts <repoRoot> <gate-command.json> <mutation.patch>",
	);
	expect(addressCommentsFlow).toContain(
		'scripts/mutation-proof.ts" "<repoRoot>" "<reviewDir>/green-command-<commentId>.json" "<reviewDir>/mutation-<commentId>.patch"',
	);
	expect(referenceDocs.replace(/"\$FACTORY_ROOT\/([^"]+)"/g, "$1")).toContain(
		MUTATION_PROOF_INVOCATION,
	);
	expect(addressComments).toContain(
		"`bug`/`test-gap`/`non-functional` → `action`",
	);
	expect(plain(addressComments)).toMatch(
		/Never use this class to skip the red gate on a defect/,
	);
	expect(assessor).toContain("bug | test-gap | non-functional");
	expect(plain(assessor)).toMatch(
		/If you cannot confirm the behaviour is right, or the comment also reports wrong behaviour, it is a bug/,
	);
});

test("pipeline monitoring retries CI only through the gated retry operation", () => {
	expect(pipelineMonitoring).toContain(`${FORGE_PROVIDER} retry "<repoRoot>"`);
	const fields = Object.keys(RetryForgePipelineInput._def.schema.shape).filter(
		(field) => field !== "dryRun",
	);
	expect(fields.sort()).toEqual(
		["approved", "headRevision", "ref", "runContractPath", "ticketKey"].sort(),
	);
	for (const field of fields) {
		expect(pipelineMonitoring).toContain(`"${field}": `);
	}
	const contract = plain(pipelineMonitoring);
	expect(contract).not.toMatch(/no portable retry operation/);
	expect(contract).toMatch(
		/A test failure, an unknown failure, or an infrastructure failure that repeats after its retry goes to the operator/,
	);
	expect(contract).toMatch(/never as permission to retry another way/);
	expect(plain(auto)).toMatch(
		/ask once whether an infrastructure CI failure may be retried once/,
	);
	expect(auto).toContain('`ciRetry: { "infrastructure": 1 }`');
	expect(plain(auto)).toMatch(/A test failure is never retried/);
});

test("changes say what was decided for the reader and what the checks leave open", () => {
	for (const prompt of [implementer, implementerOpus, testWriter]) {
		expect(prompt).toContain("**Decisions:**");
	}
	for (const title of CHANGE_DESCRIPTION_SECTIONS) {
		expect(execute).toContain(`\`### ${title}\``);
		expect(referenceDocs).toContain(`"${title}"`);
	}
	expect(execute).toContain(
		CHANGE_DESCRIPTION_INVOCATION.replace(
			"scripts/change-description.ts check <create-input.json>",
			'scripts/change-description.ts" check "<reviewDir>/create-input.json"',
		),
	);
	expect(referenceDocs.replace(/"\$FACTORY_ROOT\/([^"]+)"/g, "$1")).toContain(
		CHANGE_DESCRIPTION_INVOCATION,
	);
	expect(plain(execute)).toMatch(
		/Never create the change without a passing check/,
	);
	const readiness = plain(releaseReadiness);
	expect(releaseReadiness).toContain("### Decisions to know about");
	expect(releaseReadiness).toContain("### What the checks do not prove");
	expect(readiness).toMatch(
		/Always include "Decisions to know about" and "What the checks do not prove"/,
	);
	expect(readiness).toContain(`"${DECISIONS_SECTION}"`);
	expect(readiness).toContain(`"${UNPROVEN_SECTION}"`);
	expect(readiness).toMatch(
		/treat every listed decision as a choice to challenge, not a settled fact/,
	);
});

test("a rule written from samples is measured on samples it was not written from", () => {
	const heldOut = ".review/<changeName>/held-out-samples/";
	for (const doc of [
		draft,
		execute,
		implementer,
		implementerOpus,
		testWriter,
	]) {
		expect(doc).toContain(heldOut);
	}
	expect(plain(draft)).toMatch(
		/the samples the rule is written from cannot be its only test/,
	);
	expect(plain(draft)).toMatch(
		/Label each one from its source, never by running code/,
	);
	expect(plain(executeHeldOutSamples)).toMatch(
		/Never send a miss to the implementer/,
	);
	expect(executeHeldOutSamples).toContain("held-out-gate-<source-commit>.json");
	for (const prompt of [implementer, implementerOpus]) {
		expect(prompt).toContain(`Never read \`${heldOut}\``);
	}
	expect(holdoutReviewer.replace(/\s+/g, " ")).toContain(
		"whose only tests use the samples it was written from is **not** meaningfully tested",
	);
	expect(referenceDocs).toContain("held-out samples");
});

const STAGE_TRIGGER_SKILLS = [
	{
		name: "groom",
		text: groom,
		step0Anchor: "### Step 0: Confirm this is a run",
		firstWriteAnchor: "### Step 2a",
	},
	{
		name: "draft",
		text: draft,
		step0Anchor: "0. **Confirm this is a run.**",
		firstWriteAnchor: "1. **Fetch the work item.**",
	},
] as const;

function occurrences(text: string, needle: string): number {
	return text.split(needle).length - 1;
}

function step0Section(skill: (typeof STAGE_TRIGGER_SKILLS)[number]): string {
	const start = skill.text.indexOf(skill.step0Anchor);
	const end = skill.text.indexOf(skill.firstWriteAnchor);
	expect(start).toBeGreaterThanOrEqual(0);
	const stop =
		skill.name === "groom"
			? skill.text.slice(start).search(/^### Step 1\b/m) + start
			: end;
	return plain(skill.text.slice(start, stop));
}

describe("groom and draft descriptions name what starts them and what must not", () => {
	for (const skill of STAGE_TRIGGER_SKILLS) {
		const description = () => parseSkillDescription(skill.text) ?? "";
		const sentences = () => description().split(/(?<=[.?!])\s+/);

		test(`${skill.name} states what it does, then Use when, then Not for`, () => {
			const all = sentences();
			const useWhen = all.findIndex((s) => s.startsWith("Use when"));
			const notFor = all.findIndex((s) => s.startsWith("Not for"));
			expect(useWhen).toBeGreaterThan(0);
			expect(notFor).toBeGreaterThan(useWhen);
		});

		test(`${skill.name} not-for sentence names a question about what a ticket means`, () => {
			const notFor = sentences().find((s) => s.startsWith("Not for")) ?? "";
			expect(notFor).toContain("a question about what a ticket means");
		});

		test(`${skill.name} start and not-for sentences use no em or en dash`, () => {
			const clauses = sentences().filter(
				(s) => s.startsWith("Use when") || s.startsWith("Not for"),
			);
			expect(clauses).toHaveLength(2);
			for (const clause of clauses) {
				expect(clause).not.toMatch(/[\u2014\u2013]/);
			}
		});

		test(`${skill.name} description has no colon followed by a space`, () => {
			expect(description()).not.toContain(": ");
		});
	}
});

describe("loading groom or draft never authorises the run", () => {
	for (const skill of STAGE_TRIGGER_SKILLS) {
		test(`${skill.name} has its step 0 anchor exactly once, before its first write`, () => {
			expect(occurrences(skill.text, skill.step0Anchor)).toBe(1);
			expect(occurrences(skill.text, skill.firstWriteAnchor)).toBe(1);
			expect(skill.text.indexOf(skill.step0Anchor)).toBeLessThan(
				skill.text.indexOf(skill.firstWriteAnchor),
			);
		});

		test(`${skill.name} asks exactly one question and writes nothing before the answer`, () => {
			const step0 = step0Section(skill);
			expect(step0).toContain("Loading this skill does not authorise a run.");
			expect(step0).toContain("exactly one question");
			expect(step0).toMatch(/writes? nothing tracked/i);
			expect(step0).toMatch(/posts? nothing/i);
			expect(step0).toMatch(/dispatch(es)? no worker/i);
			expect(step0).toMatch(/clear yes/i);
		});

		test(`${skill.name} never asks the extra question on a named invocation`, () => {
			const step0 = step0Section(skill);
			expect(step0).toMatch(/named invocation/i);
			expect(step0).toContain(`/${skill.name}`);
			expect(step0).toMatch(/with or without an argument/i);
			expect(step0).toMatch(/conductor/i);
			expect(step0).toMatch(/dispatch/i);
			expect(step0).toContain(".delivery/runs/<id>.run-contract.json");
			expect(step0).toMatch(/step 1/i);
		});

		test(`${skill.name} answers the original question and ends on a reply that is not a clear yes`, () => {
			const step0 = step0Section(skill);
			expect(step0).toMatch(/answers? the original question and ends/i);
			expect(step0).toMatch(/silence/i);
			expect(step0).toMatch(/no second (clarifying )?question/i);
		});
	}

	test("groom step 0 comes before step 1, and the answer writes nothing", () => {
		const step0 = groom.indexOf("### Step 0: Confirm this is a run");
		const step1 = groom.search(/^### Step 1\b/m);
		const step2a = groom.indexOf("### Step 2a");
		expect(step0).toBeGreaterThanOrEqual(0);
		expect(step0).toBeLessThan(step1);
		expect(step1).toBeLessThan(step2a);
		expect(step0Section(STAGE_TRIGGER_SKILLS[0])).toMatch(
			/the answer writes nothing/i,
		);
	});

	test("groom step 1 still stops and asks when there is no usable input", () => {
		expect(groom).toContain(
			"When no usable input exists anywhere, **stop and ask** the operator for an idea, a file path, or a description. Never guess, and never carry on with nothing.",
		);
	});

	test("draft answer to a question about a ticket may only use the step 1 fetch, saved only into an already ignored review folder", () => {
		const step0 = step0Section(STAGE_TRIGGER_SKILLS[1]);
		expect(step0).toMatch(/step 1/i);
		expect(step0).toMatch(/fetch/i);
		expect(step0).toContain("<reviewDir>");
		expect(step0).toMatch(/already ignored/i);
		expect(step0).toMatch(/\.gitignore/);
		expect(step0).toMatch(/provider file/i);
		expect(step0).toMatch(/remote provider|provider directly/i);
		expect(step0).toMatch(/posts? a note/i);
	});

	test("draft step 1 still fetches through the read command that step 0 refers to", () => {
		expect(plain(draft)).toMatch(/work-item-provider\.ts\W+read/);
	});
});

function textBetween(text: string, start: string, end?: string): string {
	const from = text.indexOf(start);
	expect(from).toBeGreaterThanOrEqual(0);
	const to = end === undefined ? -1 : text.indexOf(end, from + start.length);
	return text.slice(from, to === -1 ? undefined : to);
}

function blockAfter(text: string, heading: string): string {
	const from = text.indexOf(heading);
	expect(from).toBeGreaterThanOrEqual(0);
	const rest = text.slice(from + heading.length);
	const next = rest.search(/\n(### |```)/);
	return next === -1 ? rest : rest.slice(0, next);
}

describe("the code review keeps a candidate that needs an outside fact", () => {
	const adjudication = textBetween(
		codeReviewMax,
		"## Adjudicate every candidate",
		"## Severity",
	);
	const severity = textBetween(codeReviewMax, "## Severity", "## Output");
	const output = textBetween(codeReviewMax, "## Output", "## Never");
	const scope = textBetween(
		codeReviewMax,
		"## Scope this round",
		"## Build the review brief",
	);

	test("adjudication has a third outcome with its three conditions and keeps the old drop rule", () => {
		const text = plain(adjudication);
		expect(text).toMatch(/needs-validation/i);
		expect(text).toMatch(/impact or trigger cannot be shown/i);
		expect(text).toMatch(/missing fact/i);
		expect(text).toMatch(/owner check/i);
		expect(text).toMatch(
			/search(ed)? the repository|configuration[^.]*manifests|runbooks/i,
		);
		expect(text).toMatch(
			/(does show|shows) the fact|judged by (it|that fact)/i,
		);
		expect(text).toMatch(/not a missing fact|not sure|manufactur/i);
	});

	test("a needs-validation item carries no severity and never sets BLOCK", () => {
		const text = plain(severity);
		expect(text).toMatch(/needs-validation/i);
		expect(text).toMatch(/no severity|carries none|without (a )?severity/i);
		expect(text).toMatch(/(not|never|no)[^.]{0,60}BLOCK/);
	});

	test("the review writes the owner check and never runs it or probes a live environment", () => {
		expect(plain(codeReviewMax)).toMatch(
			/(never|do not|does not|must not)[^.]{0,120}(probe|live environment)/i,
		);
		expect(plain(codeReviewMax)).toMatch(
			/(never|do not|does not|must not)[^.]{0,80}run (the|that) (owner )?check|owner check[^.]{0,80}(never|not) run/i,
		);
	});

	test("the output template lists the section between Findings and Verification", () => {
		const findings = output.indexOf("### Findings");
		const heading = output.indexOf(NEEDS_VALIDATION_HEADING);
		const verification = output.indexOf("### Verification");
		expect(findings).toBeGreaterThanOrEqual(0);
		expect(heading).toBeGreaterThan(findings);
		expect(verification).toBeGreaterThan(heading);
		expect(output).toContain("**Missing fact:**");
		expect(output).toContain("**Owner check:**");
	});

	test("a review with only items passes and a blocker still blocks, both stated in the output rules", () => {
		const text = plain(output);
		expect(text).toMatch(/No findings\./);
		expect(text).toMatch(/PASS/);
		expect(text).toMatch(/BLOCK/);
		expect(text).toMatch(/needs-validation/i);
	});

	test("the second pass summary template uses the same heading", () => {
		const template = textBetween(
			mrReview,
			"## Output shape for the summary note",
		);
		expect(template).toContain(NEEDS_VALIDATION_HEADING);
	});

	test("one statement requires every earlier item to be accounted for", () => {
		expect(plain(codeReviewMax)).toMatch(
			/every needs-validation item[^.]{0,80}earlier review/i,
		);
		expect(codeReviewMax).toContain("### Earlier findings");
		expect(plain(codeReviewMax)).toMatch(/closed:/);
	});

	test("the delta scope text carries the item forward with its fact copied unchanged", () => {
		const delta = plain(
			textBetween(scope, "- **`delta`**", "The scope never narrows"),
		);
		expect(delta).toMatch(/needs-validation/i);
		expect(delta).toMatch(/unchanged/i);
		expect(delta).toContain("### Earlier findings");
	});

	test("the full scope text carries the item forward and does not reword it", () => {
		const full = plain(textBetween(scope, "- **`full`**", "- **`delta`**"));
		expect(full).toMatch(/needs-validation/i);
		expect(full).toMatch(/unchanged|copy/i);
	});

	test("the no-candidate text still writes the earlier items and applies nothing to verify to lens candidates only", () => {
		const none = plain(textBetween(adjudication, "- `none`:", "- `standard`:"));
		expect(none).toMatch(/needs-validation|earlier/i);
		expect(none).toMatch(/lens candidates/i);
		expect(none).toMatch(/Earlier findings|carried|closed|still/i);
	});
});

describe("the second pass carries needs-validation items through", () => {
	const consolidate = plain(textBetween(mrReview, "## Phase 5", "## Phase 6"));

	test("items are carried unchanged, never tagged or counted, and get no anchored note", () => {
		expect(consolidate).toMatch(/needs-validation/i);
		expect(consolidate).toMatch(/unchanged in substance/i);
		expect(consolidate).toMatch(/not tagged|never tag|no tag|are not tag/i);
		expect(consolidate).toMatch(/not count|never count|not counted/i);
		expect(consolidate).toMatch(/NN-<slug>/);
		expect(consolidate).toMatch(
			/only in summary\.md|summary\.md only|summary only/i,
		);
	});
});

describe("release readiness states the needs-validation gate", () => {
	const decide = textBetween(
		releaseReadiness,
		"### 6. Decide",
		"### 7. Write the brief",
	);
	const brief = textBetween(
		releaseReadiness,
		"### 7. Write the brief",
		"## Checkpoint",
	);
	const checkpoint = textBetween(
		releaseReadiness,
		"## Checkpoint",
		"## Ledger writes",
	);
	const writes = textBetween(
		releaseReadiness,
		"## Ledger writes",
		"## Terminal stops",
	);

	function namesCommand(doc: string, command: string): boolean {
		const [script, ...args] = command.split(" ");
		const wrapped = (root: string) =>
			`bun "${root}/${script}" ${args.join(" ")}`;
		return (
			doc.includes(command) ||
			doc.includes(wrapped("${FACTORY_ROOT}")) ||
			doc.includes(wrapped("$FACTORY_ROOT"))
		);
	}

	test("the decide step lists an unacknowledged item as a NO-GO reason and names the command", () => {
		expect(namesCommand(decide, NEEDS_VALIDATION_CHECK_INVOCATION)).toBe(true);
		const text = plain(decide);
		expect(text).toMatch(/needs-validation/i);
		expect(text).toMatch(/acknowledg/i);
		expect(text).toMatch(/exit 1/i);
		expect(text).toMatch(/exit 2/i);
		expect(text).toMatch(/review-scope\.json/);
		expect(text).toMatch(/previous/);
		expect(text).toMatch(/incomplete needs-validation item/i);
		expect(text).toContain("/delivery review <iid>");
	});

	test("the decide step keeps the item out of findings, comments, address-comments and risk acceptance", () => {
		const text = plain(releaseReadiness);
		expect(plain(decide)).toMatch(/not a finding/i);
		expect(plain(decide)).toMatch(/no severity/i);
		expect(plain(decide)).toMatch(
			/(not|never|no)[^.]{0,80}comment blocker|not (reported as )?an unanswered comment/i,
		);
		expect(plain(decide)).toMatch(/(never|not|no)[^.]{0,80}address-comments/i);
		expect(text).toMatch(
			/risk acceptance[^.]{0,120}(do|does) not|(do|does) not[^.]{0,120}risk acceptance/i,
		);
		expect(text).toMatch(
			/continuous-delivery: yes[^.]{0,120}(do|does) not|(do|does) not[^.]{0,120}continuous-delivery: yes/i,
		);
	});

	test("an Approvals line scoped to the merge request is what clears an item", () => {
		expect(plain(decide)).toMatch(/Approvals/);
		expect(plain(decide)).toMatch(/merge request|MR/);
	});

	test("the brief lists open items and acknowledged items under their own sections, in plain words", () => {
		expect(brief).toContain("### Facts to confirm before merging");
		expect(brief).toContain("### Facts acknowledged");
		const open = plain(
			blockAfter(brief, "### Facts to confirm before merging"),
		);
		expect(open).toMatch(/id/i);
		expect(open).toMatch(/fact/i);
		expect(open).toMatch(/check/i);
		const acknowledged = plain(blockAfter(brief, "### Facts acknowledged"));
		expect(acknowledged).toMatch(/acknowledged by/i);
		expect(acknowledged).not.toMatch(/\bresolved\b/i);
		expect(plain(blockAfter(brief, "### Must fix before merging"))).not.toMatch(
			/needs-validation|missing fact/i,
		);
	});

	test("the checkpoint table has a row for the operator acknowledging an item", () => {
		const row = checkpoint
			.split("\n")
			.find((line) => line.startsWith("|") && /acknowledg/i.test(line));
		expect(row).toBeTruthy();
		expect(row).toMatch(/Approvals/);
		expect(row).toMatch(/recompute/i);
		expect(row).toMatch(/reissue/i);
	});

	test("the ledger writes record each acknowledgement in Approvals and the open count in Decisions", () => {
		const lines = writes.split("\n");
		const approvals = lines.find((line) => line.startsWith("- Approvals:"));
		const decisions = lines.find((line) => line.startsWith("- Decisions:"));
		expect(approvals).toMatch(/acknowledg/i);
		expect(decisions).toMatch(/needs-validation|open item/i);
	});

	test("the workflow names the acknowledgement by the phrase the code defines", () => {
		expect(releaseReadiness).toContain(NEEDS_VALIDATION_ACK_PHRASE);
	});
});

test("auto and the reference say how git on a worker worktree stays safe", () => {
	const command = `git ${SAFE_GIT_CONFIG.join(" ")} <command>`;
	expect(auto.replace(/\s+/g, " ")).toContain(command);
	expect(plain(auto)).toMatch(
		/a worker can commit but cannot plant a program for the host to run/,
	);
	expect(referenceDocs.replace(/\s+/g, " ")).toContain(
		SAFE_GIT_CONFIG.join(" "),
	);
});

test("the build and comment skills say what starts them and what must not", () => {
	for (const skill of [execute, addressComments]) {
		const description =
			skill.split("\n").find((line) => line.startsWith("description:")) ?? "";
		expect(description).toMatch(/ Use when the operator asks to /);
		expect(description).toMatch(/ Not for a question about /);
		expect(description).toMatch(
			/or the delivery conductor dispatches this stage\./,
		);
	}
});

test("severity is capped by the impact a finding shows", () => {
	const severity = plain(
		textBetween(codeReviewMax, "## Severity", "## Output"),
	);
	expect(severity).toMatch(/Severity never exceeds demonstrated impact/);
	expect(severity).toMatch(
		/A finding whose concrete damage you cannot state \(what breaks, for whom, on what input\) is Low at most/,
	);
	expect(severity).toMatch(
		/Medium or above needs both a named trigger and a stated consequence\. Without both, it is Low/,
	);
	expect(severity).toMatch(
		/only weakens a control .* rates lower than one that defeats it/,
	);
	expect(severity).toMatch(/Critical, High, and Medium block readiness/);
});

test("execute names when to read each reference file it moved out", () => {
	const flat = execute.replace(/\s+/g, " ");
	expect(flat).toMatch(
		/Only when it is exactly `always`, follow \*\*Implementation\*\* in `\$FACTORY_ROOT\/reference\/routing-profiling\.md`/,
	);
	expect(flat).toMatch(
		/When `routingProfiling` is exactly `always`, follow \*\*Holdout review\*\* in `\$FACTORY_ROOT\/reference\/routing-profiling\.md`/,
	);
	expect(flat).toContain(
		"Do not dispatch a catalogue fast model unless it is live. Its promotion rules and safety floors are in `$FACTORY_ROOT/reference/fast-models.md`.",
	);
	expect(flat).toContain("`$FACTORY_ROOT/reference/mechanical-edit.md`");
	expect(routingProfiling).toContain("## Implementation");
	expect(routingProfiling).toContain("## Holdout review");
	expect(flat).toContain(
		"Profiling never changes the live model or weakens a quality gate.",
	);
	for (const pointer of [
		"read `reference/re-entry.md` and reconcile before any write",
		"follow **Before the test writer** in `reference/scripted-edit.md` first",
		"follow **Before an implementer dispatch** in `reference/scripted-edit.md`",
		"read `reference/characterization.md` and pin them before step 4",
		"read `reference/red-zones.md` for what approval counts",
		"When the meta read exits non-zero or the selection prints `opus`, read `reference/model-selection.md`",
		"do not dispatch the implementer for that test; read `reference/test-contradicts-spec.md`",
		"read `reference/held-out-samples.md` once the green gate passes",
		"**`fix`** or **`escalate`** → read `reference/verdict-routes.md`",
	]) {
		expect(flat).toContain(pointer);
	}
	expect(executeScriptedEdit).toContain("## Before the test writer");
	expect(executeScriptedEdit).toContain("## Before an implementer dispatch");
	const moved = readdirSync(join(ROOT, "../skills/execute/reference"));
	expect(moved.length).toBeGreaterThan(0);
	for (const name of moved) {
		const text = read(`../skills/execute/reference/${name}`);
		expect([name, /^# .+\n\nThis applies /.test(text)]).toEqual([name, true]);
		expect([name, flat.includes(`\`reference/${name}\``)]).toEqual([
			name,
			true,
		]);
	}
});

test("execute's model edge cases keep the defended-case default and the justification", () => {
	const edges = plain(executeModelSelection);
	expect(edges).toMatch(/do not guess/i);
	expect(edges).toContain(
		"PRD §9: absent a recorded, defended complexity case, Sonnet",
	);
	expect(edges).toMatch(/recorded justification must appear in the MR/i);
	expect(edges).toMatch(/justification is then the run's level/i);
});

test("address-comments names when to read each reference file it moved out", () => {
	const flat = addressComments.replace(/\s+/g, " ");
	expect(flat).toMatch(
		/Only when it is exactly `always`, follow \*\*Comment classification\*\* in `\$FACTORY_ROOT\/reference\/routing-profiling\.md`/,
	);
	expect(routingProfiling).toContain("## Comment classification");
	expect(flat).toContain(
		"The setting never changes classification dispatch or weakens a quality gate.",
	);
	expect(
		addressCommentsReference["mechanical-edit-unit"].replace(/\s+/g, " "),
	).toContain(
		"The units it proves are listed in `$FACTORY_ROOT/reference/mechanical-edit.md`",
	);
	for (const pointer of [
		"If in-scope comments are empty, do not dispatch the `comment-assessor`. Read `reference/empty-scope.md`",
		"Read `reference/gate-evidence-reuse.md` before reusing a persisted per-comment or cumulative gate artifact",
		"read `reference/scope-rules.md` when a scoping result needs explaining",
		"Read **Repeated assumption** in `reference/premise-check.md` before writing any fix for those comments",
		"Read **Repeated fix failures** in `reference/premise-check.md` after two failures that share the same assumption",
		"Read `reference/suggestion-apply.md` when an action comment's body is only a suggestion fence on a new-side line",
		"Read `reference/also-at.md` when an action comment, or the review finding it repeats, lists **Also at:** locations",
		"`reference/mechanical-edit-unit.md` when the comment names a bounded rename, import-only, or format-only change",
		"**`test-gap`** (action, green with a mutation proof): read `reference/test-gap.md`",
	]) {
		expect(flat).toContain(pointer);
	}
	for (const name of ADDRESS_COMMENTS_REFERENCES) {
		const text = addressCommentsReference[name];
		expect([name, /^# \S/.test(text)]).toEqual([name, true]);
		expect([name, flat.includes(`reference/${name}.md`)]).toEqual([name, true]);
	}
	const premise = addressCommentsReference["premise-check"];
	expect(premise).toContain("## Repeated assumption");
	expect(premise).toContain("## Repeated fix failures");
});
