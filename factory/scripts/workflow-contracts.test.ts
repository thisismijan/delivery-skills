import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
	DEFAULT_MAX_PARALLEL_WORKTREES,
	DEFAULT_ROUTING_PROFILING,
} from "./config";
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
import { MAX_DERIVED_ACCEPTANCE_CRITERIA } from "./verdicts";

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
		for (const document of [auto, delivery, epicToBacklog, rootReadme]) {
			expect(plain(document)).toMatch(/maxParallelWorktrees/i);
		}
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

describe("context-rich human decisions", () => {
	test("the conductor owns the canonical brief", () => {
		expect(delivery).toContain("## Human decision brief");
		expect(delivery).toContain("### DSA lens");
		expect(delivery).toContain("### System-design lens");
		expect(delivery).toContain("No material DSA difference");
		expect(delivery).toContain("No material system-design");
		expect(delivery).toMatch(/Never invent Big-O claims/i);
		expect(plain(delivery)).toMatch(/do not include a recommendation/i);
		expect(plain(delivery)).toMatch(/after they choose/i);
		expect(delivery).toContain("## Your choice:");
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
		expect(delivery).toMatch(/failed gate never\s+becomes an\s+option/i);
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
		expect(plain(execute)).toMatch(/typescript, javascript, python, and java/i);
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
		expect(route).toMatch(/dispatch the test-writer once/i);
		expect(route).toMatch(/never removes or loosens any other assertion/i);
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
		for (const skill of [execute, addressComments]) {
			expect(skill).toContain("apply-mechanical-edit.ts");
			expect(plain(skill)).toMatch(
				/do not ask the implementer whether the work is menial/i,
			);
			expect(plain(skill)).toMatch(/helper already wrote/i);
			expect(plain(skill)).toMatch(/payload flag is not proof/i);
			expect(plain(skill)).toMatch(/do not dispatch a catalogue fast model/i);
		}
		expect(plain(execute)).toMatch(
			/when apply is script.*do not dispatch the test-writer or the implementer/i,
		);
		const implementStep = execute.split("**Implement to green.**")[1] ?? "";
		expect(plain(implementStep)).toMatch(
			/when apply is script[\s\S]*do not dispatch the implementer[\s\S]*continue at the green gates/i,
		);
		expect(plain(implementStep)).not.toMatch(
			/do not dispatch the implementer[\s\S]{0,80}dispatch the implementer/i,
		);
		expect(plain(execute)).toMatch(/do not run a red gate/i);
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
		expect(plain(execute)).toMatch(/unique python parameter or local/i);
		expect(plain(execute)).toMatch(/unique java field/i);
		expect(plain(execute)).toMatch(/unique typescript missing import/i);
		expect(plain(execute)).toMatch(/google-java-format/i);
		expect(plain(rootReadme)).toMatch(/python function, class,\s*parameter, or local/i);
		const controller = read("agents/task-profile-controller.md");
		expect(controller).toContain("mechanical-edit");
		expect(controller).toMatch(
			/Do not label ordinary implement as mechanical-edit/,
		);
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
			/review-packet\.ts" --ticket <work-item file> --spec <change dir> --diff <pinned diff> --evidence <lens 1 candidates> \.\.\. --out \.review\/mr-<iid>\/<full-head-sha>\/adjudication-packet\.md/,
		);
		expect(maxReview).toMatch(
			/reads that packet first instead of opening each input on its own/i,
		);
		expect(maxReview).toMatch(
			/reads the cited code of several candidates in one command/i,
		);
		expect(plain(execute)).toMatch(
			/review-packet\.ts" --ticket <work-item-file> --spec <changeDir> --out <reviewDir>\/test-packet\.md/,
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
			/review-packet\.ts" --ticket <work-item-file> --spec .* --diff <reviewDir>\/implement-diff\.patch --evidence <red-gate-artifact> --out <reviewDir>\/implement-packet\.md/,
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
		expect(comments).toMatch(
			/if in-scope comments are empty, do not dispatch/i,
		);
		expect(comments).toMatch(/forge-comments\.ts" scope/i);
		expect(comments).toMatch(/missing path or a new-side line past the end/i);
		expect(comments).toMatch(/drops resolved discussions and resolved notes/i);
		expect(comments).toMatch(/empty or whitespace-only body is outdated/i);
		expect(comments).toMatch(
			/only acknowledgements such as LGTM, thanks, approved, or done is outdated/i,
		);
		expect(comments).toMatch(/only a mention is outdated/i);
		expect(comments).toMatch(/only a URL is outdated/i);
		expect(comments).toMatch(/only emoji is outdated/i);
		expect(comments).toMatch(/only a suggestion fence on a new-side/i);
		expect(comments).toMatch(/forge-comments\.ts" apply-suggestion/i);
		expect(comments).toMatch(
			/apply is script ?, the helper already replaced that line, so do not dispatch the implementer/i,
		);
		expect(comments).toMatch(
			/bug still needs its red test\s+first, and the green gate, lint, typecheck, and holdout still run/i,
		);
		expect(comments).toMatch(
			/body is only a suggestion fence[\s\S]*suggested text is already in that file[\s\S]*outdated/i,
		);
		expect(comments).toMatch(
			/head still equals the step 2 revision.*no re-review-pending\.json existed on entry.*skip the cumulative gates and holdout re-review/i,
		);
		expect(comments).toMatch(
			/otherwise, run one full green gate.*dispatch a fresh holdout-reviewer/i,
		);
		expect(comments).toMatch(
			/stage 3 still runs \/code-review-max and \/mr-review/i,
		);
		expect(plain(execute)).toMatch(
			/reconcile implementation state without another model call.*do not dispatch the implementer or another subagent/i,
		);
	});

	test("shadow routing is opt-in and never changes live dispatch", () => {
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
		for (const skill of [draft, execute, addressComments]) {
			const contract = plain(skill);
			expect(contract).toMatch(
				/only when (?:it|routingProfiling) is (?:exactly )?always/i,
			);
			expect(contract).toMatch(/routingProfiling.*off.*skip/i);
		}
		expect(plain(execute)).toMatch(
			/regardless of this setting, dispatch the holdout-reviewer/i,
		);
		expect(plain(addressComments)).toMatch(
			/regardless of this setting, resolve frontier.*then dispatch a fresh holdout-reviewer/i,
		);
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
			/typescript, javascript, python, or java/i,
		);
		expect(plain(rootReadme)).toMatch(
			/acknowledgement-only, mention-only, url-only, and emoji-only/i,
		);
		expect(plain(referenceDocs)).toMatch(/forge-comments\.ts" apply-suggestion/i);
		expect(plain(referenceDocs)).toMatch(/ticket-feasibility\.ts/i);
		expect(plain(workflowDocs)).toMatch(
			/whole-body suggestion fence is applied without the implementer/i,
		);
		expect(plain(rootReadme)).toMatch(
			/\/execute skips the test-writer, red gate, and implementer/i,
		);
		expect(plain(workflowDocs)).toMatch(
			/unique python parameter or local/i,
		);
		expect(plain(referenceDocs)).toMatch(/node_modules\/\.bin\/prettier/i);
		expect(plain(referenceDocs)).toMatch(/bin\/google-java-format/i);
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
		expect(execute).toContain("test-repo stand-in");
		expect(delivery).toContain("Public rankings never promote");
		expect(delivery).toContain("Test-repo stand-in scores never promote");
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
		expect(delivery).toContain("local-files");
		expect(delivery).toMatch(/Never infer from remotes, credentials, host/i);
		expect(delivery).toContain("--replace");
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
		expect(execute).toContain(`${FORGE_PROVIDER} find`);
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
