import { describe, expect, test } from "bun:test";
import {
	type CheckResult,
	capabilityPreflight,
	redactRemote,
	summarize,
} from "./preflight";
import { parseRuntimeManifest } from "./runtime-manifest";
import { loadConstitution } from "./sdlc-constitution";

function check(changes: Partial<CheckResult>): CheckResult {
	return { name: "a", ok: true, required: true, detail: "", ...changes };
}

const guardedRuntime = parseRuntimeManifest({
	version: 1,
	capabilities: {
		"mutation.guard": {
			available: true,
			mode: "native",
			invocation: "hook.pre-mutation",
			enforcement: "enforced",
		},
	},
});

describe("summarize", () => {
	test("an optional failure does not stop a ready verdict", () => {
		const verdict = summarize([
			check({ name: "a" }),
			check({ name: "b", ok: false, required: false, detail: "skipped" }),
		]);
		expect(verdict.allRequiredPassed).toBe(true);
	});

	test("a required failure means not ready", () => {
		const verdict = summarize([check({ ok: false, detail: "x" })]);
		expect(verdict.allRequiredPassed).toBe(false);
	});

	test("prints one line per check carrying its name and detail", () => {
		const { lines } = summarize([
			check({
				name: "subprocess runtime",
				ok: false,
				detail: "configure process.run in the runtime manifest",
			}),
		]);
		expect(lines).toHaveLength(1);
		expect(lines[0]).toContain("subprocess runtime");
		expect(lines[0]).toContain("configure process.run in the runtime manifest");
	});

	test("marks passed, blocking and optional checks differently", () => {
		const { lines } = summarize([
			check({ name: "up" }),
			check({ name: "down", ok: false, detail: "why" }),
			check({ name: "maybe", ok: false, required: false }),
		]);
		expect(lines).toEqual([
			"\u2713 up",
			"\u2717 down \u2014 why",
			"\u2022 maybe",
		]);
	});

	test("the constitution check can carry the live hash", () => {
		const live = loadConstitution();
		const detail = `${live.document.id} v${live.document.version} ${live.hash}`;
		const checks = [check({ name: "SDLC constitution", detail })];
		expect(summarize(checks).allRequiredPassed).toBe(true);
		expect(checks[0]?.detail).toContain(live.hash);
	});
});

describe("capabilityPreflight", () => {
	test("an empty runtime manifest blocks execute on the mutation guard", () => {
		const empty = parseRuntimeManifest({ version: 1, capabilities: {} });
		const checks = capabilityPreflight("execute", empty);
		expect(summarize(checks).allRequiredPassed).toBe(false);
		const guard = checks.find((item) => item.name === "mutation.guard");
		expect(guard?.ok).toBe(false);
		expect(guard?.detail).toMatch(/runtime manifest/i);
	});

	test("an advertised guard lets execute and review through", () => {
		const execute = capabilityPreflight("execute", guardedRuntime);
		expect(summarize(execute).allRequiredPassed).toBe(true);
		const review = capabilityPreflight("review", guardedRuntime);
		expect(review.every((item) => item.ok)).toBe(true);
	});
});

describe("redactRemote", () => {
	test("hides credentials embedded in an http(s) remote", () => {
		expect(
			redactRemote("https://user:token@gitlab.example/group/repo.git"),
		).toBe("https://[redacted]@gitlab.example/group/repo.git");
		expect(redactRemote("fetch HTTP://bot@host/x and http://a@b/c")).toBe(
			"fetch HTTP://[redacted]@host/x and http://[redacted]@b/c",
		);
	});

	test("leaves a remote without credentials alone", () => {
		const plain = "git@gitlab.example:group/repo.git https://gitlab.example/x";
		expect(redactRemote(plain)).toBe(plain);
	});
});
