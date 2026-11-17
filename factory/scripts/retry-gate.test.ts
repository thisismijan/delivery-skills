import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { FailedJob } from "./ci-failure";
import type { ForgeFailedJob, ForgeFailures } from "./forge-provider";
import { type RetryGateInput, decideRetry } from "./retry-gate";

const HEAD = "a".repeat(40);

const RECORDED: Array<FailedJob & { expected: string }> = JSON.parse(
	readFileSync(join(import.meta.dir, "fixtures", "ci-failures.json"), "utf8"),
);

function recorded(name: string, id: string, attempt = 1): ForgeFailedJob {
	const found = RECORDED.find((failure) => failure.name === name);
	if (!found) throw new Error(`no recorded failure ${name}`);
	return {
		id,
		name: name.replace(/^!\d+ /, ""),
		...(found.failureReason ? { failureReason: found.failureReason } : {}),
		attempt,
		...(found.logTail ? { logTail: found.logTail } : {}),
	};
}

function failures(
	jobs: ForgeFailedJob[],
	pipeline: Partial<{
		status: string;
		kind: "merge-train" | "merge-request" | "branch";
		attempt: number;
	}> = {},
): ForgeFailures {
	return {
		version: 1,
		provider: "sample-forge",
		ref: "12",
		headRevision: HEAD,
		pipeline: {
			available: true,
			id: "500",
			status: pipeline.status ?? "failed",
			kind: pipeline.kind ?? "merge-request",
			attempt: pipeline.attempt ?? 1,
			failedJobs: jobs,
		},
	};
}

function gate(overrides: Partial<RetryGateInput> = {}) {
	return decideRetry({
		headRevision: HEAD,
		failures: failures([recorded("!985 workspace-build", "71")]),
		contract: { ok: true },
		allowedRetries: 1,
		...overrides,
	});
}

describe("decideRetry", () => {
	test("retries a first infrastructure failure the contract allows", () => {
		expect(gate()).toEqual({
			decision: "retry",
			jobIds: ["71"],
			jobNames: ["workspace-build"],
		});
	});

	test("retries every recorded infrastructure failure once", () => {
		for (const failure of RECORDED.filter(
			({ expected }) => expected === "infrastructure",
		)) {
			expect(
				gate({ failures: failures([recorded(failure.name, "9")]) }).decision,
			).toBe("retry");
		}
	});

	test("stops when the infrastructure failure repeats after its retry", () => {
		const result = gate({
			failures: failures([recorded("!983 job-image-smoke", "88", 2)]),
		});
		expect(result.decision).toBe("stop");
		expect(result).toMatchObject({
			reasons: [
				expect.stringContaining(
					"An infrastructure failure that repeats after its retry goes to the operator.",
				),
				expect.stringContaining("Retry it in the forge"),
			],
		});
	});

	test("never retries the !1012 test failure, even with spare retries", () => {
		const result = gate({
			failures: failures([recorded("!1012 test:factory", "40")]),
			allowedRetries: 1,
		});
		expect(result.decision).toBe("stop");
		expect(JSON.stringify(result)).toContain("a test failure is never retried");
	});

	test("stops when one failed job is not infrastructure, as on !982", () => {
		const result = gate({
			failures: failures([
				recorded("!982 lint", "20"),
				recorded("!982 spotbugs-sast", "21"),
			]),
		});
		expect(result.decision).toBe("stop");
		expect(JSON.stringify(result)).toContain("lint failed for a reason");
	});

	test("stops when the contract allows no retry", () => {
		expect(gate({ allowedRetries: 0 })).toEqual({
			decision: "stop",
			reasons: [
				"The run contract does not allow CI retries. Retry it in the forge if it should run again, then resume delivery.",
			],
		});
	});

	test("never allows more than one retry, whatever the input says", () => {
		const result = gate({
			failures: failures([recorded("!985 workspace-build", "71", 2)]),
			allowedRetries: 5,
		});
		expect(result.decision).toBe("stop");
	});

	test("stops when the run contract does not check", () => {
		expect(gate({ contract: { ok: false, reason: "hash mismatch" } })).toEqual({
			decision: "stop",
			reasons: ["The run contract does not allow this retry: hash mismatch."],
		});
	});

	test("never retries a deploy job", () => {
		const job = {
			...recorded("!985 workspace-build", "72"),
			name: "deploy:production",
		};
		const result = gate({ failures: failures([job]) });
		expect(result.decision).toBe("stop");
		expect(JSON.stringify(result)).toContain("deploy jobs are never retried");
		const staged = {
			...recorded("!985 workspace-build", "73"),
			stage: "release",
		};
		expect(gate({ failures: failures([staged]) }).decision).toBe("stop");
	});

	test("re-adds a merge train once and stops when the train fails again", () => {
		const jobs = [recorded("!979 spotbugs-sast", "30")];
		expect(
			gate({ failures: failures(jobs, { kind: "merge-train", attempt: 1 }) }),
		).toEqual({
			decision: "retry",
			mergeTrain: true,
			jobNames: ["spotbugs-sast"],
		});
		const again = gate({
			failures: failures(jobs, { kind: "merge-train", attempt: 2 }),
		});
		expect(again.decision).toBe("stop");
		expect(JSON.stringify(again)).toContain(
			"merge train pipeline failed again",
		);
	});

	test("stops without fresh, failed evidence at the requested head", () => {
		expect(
			gate({ failures: failures([], { status: "running" }) }).decision,
		).toBe("stop");
		expect(gate({ failures: failures([]) }).decision).toBe("stop");
		expect(
			gate({
				failures: {
					...failures([]),
					pipeline: { available: false },
				},
			}).decision,
		).toBe("stop");
		expect(gate({ headRevision: "b".repeat(40) }).decision).toBe("stop");
	});
});
