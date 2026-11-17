import { classifyFailure } from "./ci-failure";
import type { ForgeFailures } from "./forge-provider";

// A run contract may allow at most this many retries of an infrastructure failure.
export const MAX_CI_RETRIES = 1;

const DEPLOY_JOB =
	/(^|[:\s/_-])(deploy|deployment|release|publish|rollout)([:\s/_-]|$)/i;

export interface RetryGateInput {
	headRevision: string;
	failures: ForgeFailures;
	contract: { ok: boolean; reason?: string };
	allowedRetries: number;
}

export type RetryDecision =
	| { decision: "retry"; jobIds: string[]; jobNames: string[] }
	| { decision: "retry"; mergeTrain: true; jobNames: string[] }
	| { decision: "stop"; reasons: string[] };

const OPERATOR =
	"Retry it in the forge if it should run again, then resume delivery.";

export function decideRetry(input: RetryGateInput): RetryDecision {
	if (!input.contract.ok) {
		return {
			decision: "stop",
			reasons: [
				`The run contract does not allow this retry: ${input.contract.reason ?? "it could not be checked"}.`,
			],
		};
	}
	const allowed = Math.min(input.allowedRetries, MAX_CI_RETRIES);
	if (allowed < 1) {
		return {
			decision: "stop",
			reasons: [`The run contract does not allow CI retries. ${OPERATOR}`],
		};
	}
	if (input.failures.headRevision !== input.headRevision) {
		return {
			decision: "stop",
			reasons: [
				"The change has new commits since this retry was asked for, so nothing was retried.",
			],
		};
	}
	const pipeline = input.failures.pipeline;
	if (!pipeline.available) {
		return {
			decision: "stop",
			reasons: ["There is no pipeline at the change's current head to retry."],
		};
	}
	if (pipeline.status.trim().toLowerCase() !== "failed") {
		return {
			decision: "stop",
			reasons: [
				`The pipeline at the current head is ${pipeline.status}, not failed, so nothing was retried.`,
			],
		};
	}
	if (pipeline.failedJobs.length === 0) {
		return {
			decision: "stop",
			reasons: [
				`The failed pipeline names no failed job, so its cause cannot be checked. ${OPERATOR}`,
			],
		};
	}

	const reasons: string[] = [];
	for (const job of pipeline.failedJobs) {
		if (
			DEPLOY_JOB.test(job.name) ||
			(job.stage && DEPLOY_JOB.test(job.stage))
		) {
			reasons.push(
				`${job.name} is a deploy job, and deploy jobs are never retried.`,
			);
			continue;
		}
		const classification = classifyFailure(job);
		if (classification.kind !== "infrastructure") {
			reasons.push(
				classification.kind === "test"
					? `${job.name} failed a test (${classification.reason}), and a test failure is never retried.`
					: `${job.name} failed for a reason that is not known infrastructure (${classification.reason}), so it is not retried.`,
			);
			continue;
		}
		if (pipeline.kind !== "merge-train" && job.attempt > allowed) {
			reasons.push(
				`${job.name} failed again after ${job.attempt - 1} ${job.attempt - 1 === 1 ? "retry" : "retries"} (${classification.reason}). An infrastructure failure that repeats after its retry goes to the operator.`,
			);
		}
	}
	if (pipeline.kind === "merge-train" && pipeline.attempt > allowed) {
		reasons.push(
			`The merge train pipeline failed again after ${pipeline.attempt - 1} ${pipeline.attempt - 1 === 1 ? "retry" : "retries"} for this head. An infrastructure failure that repeats after its retry goes to the operator.`,
		);
	}
	if (reasons.length > 0) {
		return { decision: "stop", reasons: [...reasons, OPERATOR] };
	}

	const jobNames = pipeline.failedJobs.map((job) => job.name);
	if (pipeline.kind === "merge-train") {
		return { decision: "retry", mergeTrain: true, jobNames };
	}
	return {
		decision: "retry",
		jobIds: pipeline.failedJobs.map((job) => job.id),
		jobNames,
	};
}
