import { buildObservation, persistObservation } from "./record-routing";
import type { RoutingObservation } from "./routing-observation";
import type { TaskProfileInput } from "./task-profile";

function profile(
	partial: Omit<TaskProfileInput, "version" | "promotionTriggers"> & {
		promotionTriggers?: string[];
	},
): TaskProfileInput {
	return {
		version: 1,
		promotionTriggers: partial.promotionTriggers ?? [],
		...partial,
	};
}

const passed = {
	gates: [{ name: "green", passed: true, attempt: 1 }],
	gatesPassed: true,
	repairs: 0,
	escalations: 0,
	terminal: "approve" as const,
};

export function representativeObservations(): RoutingObservation[] {
	const search = buildObservation({
		runId: "run-discover-dashboard",
		source: "representative-run",
		recordedAt: "2026-10-15T10:00:00.000Z",
		currentModel: "sonnet",
		profile: profile({
			taskId: "search",
			stage: "discover",
			workType: "search",
			reasoningDepth: "low",
			ambiguity: "low",
			blastRadius: "local",
			risk: "reversible",
			novelty: "known-pattern",
			verificationStrength: "strong",
			contextSize: "small",
			domains: ["user-interface"],
			reason: ["inventory existing dashboard modules"],
			promotionTriggers: ["a required source was missed"],
		}),
		outcome: passed,
		usage: { source: "tokens", inputTokens: 1200, outputTokens: 180 },
	});

	const decompose = buildObservation({
		runId: "run-groom-backlog",
		source: "representative-run",
		recordedAt: "2026-10-15T11:00:00.000Z",
		currentModel: "sonnet",
		profile: profile({
			taskId: "decompose",
			stage: "groom",
			workType: "decompose",
			reasoningDepth: "high",
			ambiguity: "high",
			blastRadius: "subsystem",
			risk: "material",
			novelty: "adaptation",
			verificationStrength: "partial",
			contextSize: "medium",
			domains: ["public-contract"],
			reason: ["the idea still names two independently shippable outcomes"],
		}),
		outcome: passed,
		usage: { source: "tokens", inputTokens: 8400, outputTokens: 1100 },
	});

	const author = buildObservation({
		runId: "run-draft-mdf-sample",
		source: "representative-run",
		recordedAt: "2026-10-15T12:00:00.000Z",
		currentModel: "sonnet",
		profile: profile({
			taskId: "author",
			stage: "draft",
			workType: "design",
			reasoningDepth: "medium",
			ambiguity: "low",
			blastRadius: "subsystem",
			risk: "material",
			novelty: "adaptation",
			verificationStrength: "partial",
			contextSize: "medium",
			domains: ["public-contract"],
			reason: ["author the OpenSpec change behind an existing test seam"],
		}),
		outcome: passed,
		usage: { source: "characters", inputChars: 24000, outputChars: 6100 },
	});

	const implement = buildObservation({
		runId: "run-execute-mdf-sample",
		source: "representative-run",
		recordedAt: "2026-10-15T13:00:00.000Z",
		currentModel: "sonnet",
		profile: profile({
			taskId: "implement",
			stage: "execute",
			workType: "implement",
			reasoningDepth: "medium",
			ambiguity: "low",
			blastRadius: "subsystem",
			risk: "material",
			novelty: "adaptation",
			verificationStrength: "strong",
			contextSize: "large",
			domains: ["public-contract"],
			reason: ["ordinary feature behind the approved seam"],
			promotionTriggers: ["green gate still fails after one repair"],
		}),
		outcome: {
			gates: [
				{ name: "red", passed: true, attempt: 1 },
				{ name: "green", passed: true, attempt: 2 },
			],
			gatesPassed: true,
			repairs: 1,
			escalations: 0,
			terminal: "continue",
		},
		usage: { source: "tokens", inputTokens: 18000, outputTokens: 4200 },
	});

	const review = buildObservation({
		runId: "run-execute-mdf-sample",
		source: "representative-run",
		recordedAt: "2026-10-15T14:00:00.000Z",
		currentModel: "opus",
		profile: profile({
			taskId: "review",
			stage: "execute",
			workType: "review",
			reasoningDepth: "high",
			ambiguity: "medium",
			blastRadius: "subsystem",
			risk: "material",
			novelty: "adaptation",
			verificationStrength: "strong",
			contextSize: "large",
			domains: ["public-contract"],
			reason: ["final holdout against the committed branch"],
		}),
		outcome: passed,
		usage: { source: "tokens", inputTokens: 22000, outputTokens: 1600 },
	});

	const classify = buildObservation({
		runId: "run-address-mdf-sample",
		source: "representative-run",
		recordedAt: "2026-10-15T15:00:00.000Z",
		currentModel: "sonnet",
		profile: profile({
			taskId: "classify",
			stage: "address",
			workType: "classify",
			reasoningDepth: "low",
			ambiguity: "low",
			blastRadius: "local",
			risk: "reversible",
			novelty: "known-pattern",
			verificationStrength: "strong",
			contextSize: "small",
			domains: ["user-interface"],
			reason: ["label in-scope review comments"],
		}),
		outcome: passed,
		usage: { source: "unavailable" },
	});

	const auth = buildObservation({
		runId: "run-execute-auth-floor",
		source: "representative-run",
		recordedAt: "2026-10-15T16:00:00.000Z",
		currentModel: "opus",
		profile: profile({
			taskId: "implement-auth",
			stage: "execute",
			workType: "implement",
			reasoningDepth: "low",
			ambiguity: "low",
			blastRadius: "local",
			risk: "safety-critical",
			novelty: "known-pattern",
			verificationStrength: "strong",
			contextSize: "medium",
			domains: ["auth"],
			reason: ["touches the login token path"],
		}),
		outcome: {
			gates: [{ name: "green", passed: false, attempt: 2 }],
			gatesPassed: false,
			repairs: 2,
			escalations: 1,
			terminal: "escalate",
		},
		usage: { source: "tokens", inputTokens: 9000, outputTokens: 2500 },
	});

	return [search, decompose, author, implement, review, classify, auth];
}

if (import.meta.main) {
	const root = process.argv[2];
	if (!root) {
		console.error("usage: representative-routing-runs <routing-root>");
		process.exit(2);
	}
	for (const observation of representativeObservations()) {
		await persistObservation(root, observation);
	}
	console.log(JSON.stringify({ count: representativeObservations().length }));
}
