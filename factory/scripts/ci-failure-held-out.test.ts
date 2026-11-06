import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { type FailureKind, classifyFailure } from "./ci-failure";

interface LabelledJob {
	name: string;
	failureReason: string;
	expected: FailureKind;
	kind: string;
	logTail: string;
}

interface LabelledSet {
	window: string;
	role: "fix" | "held-out";
	cases: LabelledJob[];
}

// Jobs the classifier was never changed against, labelled before it ran on
// them. A rule written from the other sets proves itself only here.
const SETS: LabelledSet[] = JSON.parse(
	readFileSync(
		join(import.meta.dir, "fixtures", "ci-failures-held-out.json"),
		"utf8",
	),
).sets;

// Misses measured on the held-out set and left unfixed, so the measurement
// stays honest. Fixing one makes this set stop being held out for that kind:
// label fresh jobs before changing the rules, then move the kind.
const KNOWN_HELD_OUT_MISSES = new Set([
	"HTTP/2 framing error fetching a dependency (curl 16)",
]);

describe("labelled CI failures from outside the design set", () => {
	test("the sets are the two the rules were fixed against and one held out", () => {
		expect(SETS.map((set) => set.role)).toEqual(["fix", "fix", "held-out"]);
		for (const set of SETS) expect(set.cases.length).toBeGreaterThan(0);
	});

	for (const set of SETS.filter(({ role }) => role === "fix")) {
		test(`every job in the ${set.window} set the rules were fixed against classifies as labelled`, () => {
			for (const job of set.cases) {
				expect({ job: job.name, kind: classifyFailure(job).kind }).toEqual({
					job: job.name,
					kind: job.expected,
				});
			}
		});
	}

	test("the held-out set classifies as labelled, apart from its recorded misses", () => {
		const heldOut = SETS.find(({ role }) => role === "held-out") as LabelledSet;
		for (const job of heldOut.cases) {
			const kind = classifyFailure(job).kind;
			if (KNOWN_HELD_OUT_MISSES.has(job.kind)) {
				expect({ kind: job.kind, missed: kind !== job.expected }).toEqual({
					kind: job.kind,
					missed: true,
				});
				continue;
			}
			expect({ job: job.name, kind }).toEqual({
				job: job.name,
				kind: job.expected,
			});
		}
	});

	test("no labelled job that is not infrastructure is ever called infrastructure", () => {
		for (const set of SETS) {
			for (const job of set.cases.filter(
				({ expected }) => expected !== "infrastructure",
			)) {
				expect({ job: job.name, kind: classifyFailure(job).kind }).not.toEqual({
					job: job.name,
					kind: "infrastructure",
				});
			}
		}
	});
});

describe("rules the held-out jobs exposed", () => {
	test("a job id followed by 'failed' is not a test runner's failure count", () => {
		expect(
			classifyFailure({
				name: "job-image-smoke",
				logTail:
					"curl: (35) OpenSSL SSL_connect: SSL_ERROR_SYSCALL\nFAIL - docker build -t app-job:smoke-17800267612 failed.",
			}).kind,
		).toBe("infrastructure");
		expect(
			classifyFailure({ name: "build", logTail: "Ran 506 tests.\n 3 failed\n" })
				.kind,
		).toBe("test");
	});

	test("an upstream 50x is infrastructure however the tool words it", () => {
		for (const line of [
			"curl: (22) The requested URL returned error: 504",
			"Could not read registry.example/team/app:r7: registry answered 503. Not pushing.",
			"fatal: unable to access 'https://gitlab.example/group/app.git/': The requested URL returned error: 502",
		]) {
			expect(classifyFailure({ name: "build", logTail: line }).kind).toBe(
				"infrastructure",
			);
		}
	});
});
