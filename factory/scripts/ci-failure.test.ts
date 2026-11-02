import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
	type FailedJob,
	type FailureKind,
	classifyFailure,
} from "./ci-failure";

interface RecordedFailure extends FailedJob {
	expected: FailureKind;
}

// Real failed jobs from one delivery run, anonymised. The name carries the
// change they failed on.
const RECORDED: RecordedFailure[] = JSON.parse(
	readFileSync(join(import.meta.dir, "fixtures", "ci-failures.json"), "utf8"),
);

describe("recorded CI failures", () => {
	for (const failure of RECORDED) {
		test(`${failure.name} is ${failure.expected}`, () => {
			expect(classifyFailure(failure).kind).toBe(failure.expected);
		});
	}

	test("every runner failure behind the run's infrastructure stops is infrastructure", () => {
		const changes = ["!978", "!979", "!983", "!985", "!986"];
		const infrastructure = RECORDED.filter(
			(failure) =>
				changes.some((change) => failure.name.startsWith(`${change} `)) ||
				failure.name === "!982 spotbugs-sast",
		);
		expect(infrastructure.length).toBe(8);
		for (const failure of infrastructure) {
			expect(classifyFailure(failure).kind).toBe("infrastructure");
		}
	});

	test("the !1012 test:factory timeout is a test failure", () => {
		const failure = RECORDED.find(({ name }) => name === "!1012 test:factory");
		expect(failure).toBeDefined();
		expect(classifyFailure(failure as FailedJob).kind).toBe("test");
	});

	test("the !982 lint failure was a formatting error, not infrastructure", () => {
		const failure = RECORDED.find(({ name }) => name === "!982 lint");
		expect(failure).toBeDefined();
		expect(classifyFailure(failure as FailedJob).kind).not.toBe(
			"infrastructure",
		);
	});
});

describe("classifyFailure", () => {
	test("a failure reason the forge reports as infrastructure wins", () => {
		expect(
			classifyFailure({
				name: "unit-test",
				failureReason: "runner_system_failure",
				logTail: "(fail) adds numbers",
			}),
		).toEqual({
			kind: "infrastructure",
			reason: "the forge reports runner_system_failure",
		});
	});

	test("a failing test in the log beats a network error in the same log", () => {
		expect(
			classifyFailure({
				name: "build",
				failureReason: "script_failure",
				logTail: "connection reset by peer\n(fail) adds numbers\n 1 fail",
			}).kind,
		).toBe("test");
	});

	test("a registry rate limit in a build log is infrastructure", () => {
		expect(
			classifyFailure({
				name: "build",
				failureReason: "script_failure",
				logTail: "toomanyrequests: You have reached your pull rate limit.",
			}),
		).toEqual({
			kind: "infrastructure",
			reason: "the log shows image registry rate limit",
		});
	});

	test("a test job with no infrastructure cause is a test failure", () => {
		expect(
			classifyFailure({ name: "test:api", failureReason: "script_failure" })
				.kind,
		).toBe("test");
	});

	test("anything else is unknown", () => {
		expect(
			classifyFailure({
				name: "lint",
				failureReason: "script_failure",
				logTail: "Found 1 error.",
			}).kind,
		).toBe("unknown");
		expect(classifyFailure({ name: "lint" }).kind).toBe("unknown");
	});
});
