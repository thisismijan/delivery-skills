import { expect, test } from "bun:test";
import { routePipeline } from "./pipeline-route";

const base = {
	phase: "change" as const,
	available: true,
	current: true,
	attempt: 0,
	maxAttempts: 2,
	withinApprovedScope: true,
};

test("waits for missing, running, or stale exact-revision evidence", () => {
	expect(routePipeline({ ...base, available: false }).action).toBe("wait");
	expect(routePipeline({ ...base, status: "running" }).action).toBe("wait");
	expect(
		routePipeline({ ...base, current: false, status: "success" }).action,
	).toBe("wait");
});

test("proceeds only when the exact-revision pipeline passed", () => {
	expect(routePipeline({ ...base, status: "success" })).toMatchObject({
		action: "proceed",
	});
});

test("fixes forward only for attributable failures inside the approved scope", () => {
	expect(
		routePipeline({
			...base,
			status: "failed",
			attribution: "attributable",
		}),
	).toMatchObject({ action: "fix-forward" });
	expect(
		routePipeline({
			...base,
			phase: "default-branch",
			status: "failure",
			attribution: "attributable",
		}),
	).toMatchObject({
		action: "fix-forward",
		reason: expect.stringContaining("new reviewed recovery change"),
	});
});

test("escalates unrelated, ambiguous, out-of-scope, and exhausted failures", () => {
	for (const attribution of ["unrelated", "unknown", "transient"] as const) {
		expect(
			routePipeline({ ...base, status: "failed", attribution }).action,
		).toBe("escalate");
	}
	expect(
		routePipeline({
			...base,
			status: "failed",
			attribution: "attributable",
			withinApprovedScope: false,
		}).action,
	).toBe("escalate");
	expect(
		routePipeline({
			...base,
			status: "failed",
			attribution: "attributable",
			attempt: 2,
		}).action,
	).toBe("escalate");
});
