import { describe, expect, test } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { routeReview } from "./review-route";
import type { ReviewVerdict } from "./verdicts";

function verdict(overrides: Partial<ReviewVerdict> = {}): ReviewVerdict {
	return {
		satisfied: "yes",
		specFaithful: true,
		testsMeaningful: true,
		codeMatchesSpec: true,
		readyForMain: true,
		findings: [],
		shouldEscalate: false,
		reasoning: "the change does what the spec says",
		...overrides,
	};
}

const DIMENSIONS = [
	"specFaithful",
	"testsMeaningful",
	"codeMatchesSpec",
	"readyForMain",
] as const;

describe("routing by the satisfied value", () => {
	test("a satisfied review approves, which opens a merge request for a person", () => {
		expect(routeReview(verdict(), 1, 2)).toMatchObject({
			action: "approve",
			state: "APPROVED",
		});
	});

	test("a rejection escalates", () => {
		expect(routeReview(verdict({ satisfied: "reject" }), 1, 2).action).toBe(
			"escalate",
		);
	});

	test("requested changes go back for a fix while attempts remain, then escalate", () => {
		const changes = verdict({
			satisfied: "changes_requested",
			findings: ["rename the flag"],
		});
		expect(routeReview(changes, 1, 2)).toMatchObject({
			action: "fix",
			state: "IMPLEMENTED",
		});
		expect(routeReview(changes, 2, 2)).toMatchObject({
			action: "escalate",
			state: "ESCALATED",
		});
	});

	test("the escalation flag wins over a satisfied review", () => {
		expect(routeReview(verdict({ shouldEscalate: true }), 1, 2).action).toBe(
			"escalate",
		);
	});
});

describe("a failed code-readiness dimension never approves", () => {
	test("with attempts left it routes to a fix that carries the findings", () => {
		const routing = routeReview(
			verdict({
				readyForMain: false,
				findings: ["the catch block swallows the error"],
			}),
			1,
			2,
		);
		expect(routing.action).toBe("fix");
		expect(routing.reason).toContain("the catch block swallows the error");
	});

	test("at the attempt ceiling it escalates", () => {
		expect(
			routeReview(
				verdict({ readyForMain: false, findings: ["N+1 query"] }),
				2,
				2,
			).action,
		).toBe("escalate");
	});

	test("with the escalation flag set it escalates", () => {
		expect(
			routeReview(
				verdict({
					readyForMain: false,
					shouldEscalate: true,
					findings: ["injection risk"],
				}),
				1,
				2,
			).action,
		).toBe("escalate");
	});

	test("no attempt count turns it into an approval", () => {
		for (const attempt of [1, 2]) {
			expect(
				routeReview(verdict({ readyForMain: false }), attempt, 2).action,
			).not.toBe("approve");
		}
	});

	test.each([...DIMENSIONS])(
		"%s false routes to fix before the ceiling and escalate at it",
		(dimension) => {
			const failed = verdict({ [dimension]: false });
			expect(routeReview(failed, 1, 2).action).toBe("fix");
			expect(routeReview(failed, 2, 2).action).toBe("escalate");
		},
	);
});

describe("review-route command", () => {
	const script = join(import.meta.dir, "review-route.ts");
	const run = (...args: string[]) =>
		Bun.spawnSync(["bun", script, ...args], { stdout: "pipe", stderr: "pipe" });

	test("reads a verdict from a file or from the argument itself", () => {
		const changes = JSON.stringify(
			verdict({ satisfied: "changes_requested", findings: ["add a test"] }),
		);
		const file = join(mkdtempSync(join(tmpdir(), "review-route-")), "v.json");
		writeFileSync(file, changes);
		const fromFile = run(file, "1", "2");
		expect(fromFile.exitCode).toBe(0);
		expect(JSON.parse(fromFile.stdout.toString()).action).toBe("fix");
		const inline = run(changes, "2", "2");
		expect(JSON.parse(inline.stdout.toString()).action).toBe("escalate");
	});

	test("a malformed verdict exits 1", () => {
		expect(run("{oops").exitCode).toBe(1);
	});
});
