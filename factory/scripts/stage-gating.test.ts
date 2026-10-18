import { describe, expect, test } from "bun:test";
import { parseRuntimeManifest } from "./runtime-manifest";
import { canStartStage } from "./stage-gating";

const enforced = parseRuntimeManifest({
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

const unenforced = parseRuntimeManifest({
	version: 1,
	capabilities: {
		"mutation.guard": {
			available: true,
			mode: "adapter",
			invocation: "hook.pre-mutation",
			enforcement: "unenforced",
		},
	},
});

const unknownGuard = parseRuntimeManifest({
	version: 1,
	capabilities: {
		"mutation.guard": {
			available: true,
			mode: "unavailable",
			invocation: "none",
			enforcement: "unknown",
		},
	},
});

const empty = parseRuntimeManifest({ version: 1, capabilities: {} });

describe("canStartStage", () => {
	test("denies a mutating stage without an enforceable guard and still allows read-only stages", () => {
		const execute = canStartStage({ stage: "execute", runtime: unenforced });
		expect(execute.allowed).toBe(false);
		expect(execute.reason).toMatch(/unenforced|mutation/i);
		expect(
			canStartStage({ stage: "review", runtime: unenforced }).allowed,
		).toBe(true);
		expect(
			canStartStage({ stage: "status", runtime: unenforced }).allowed,
		).toBe(true);
	});

	test("denies a mutating stage when mutation enforcement is unknown", () => {
		const result = canStartStage({ stage: "draft", runtime: unknownGuard });
		expect(result.allowed).toBe(false);
	});

	test("denies an unknown stage even on an enforced runtime", () => {
		const result = canStartStage({
			stage: "not-a-stage",
			runtime: enforced,
		});
		expect(result.allowed).toBe(false);
	});

	test("denies a mutating stage when the mutation capability is missing", () => {
		const result = canStartStage({
			stage: "execute",
			runtime: empty,
		});
		expect(result.allowed).toBe(false);
		expect(result.reason).toMatch(/mutation|manifest/i);
	});

	test("allows a mutating stage on an enforced runtime", () => {
		expect(canStartStage({ stage: "execute", runtime: enforced }).allowed).toBe(
			true,
		);
		expect(canStartStage({ stage: "draft", runtime: enforced }).allowed).toBe(
			true,
		);
		expect(canStartStage({ stage: "init", runtime: enforced }).allowed).toBe(
			true,
		);
		expect(canStartStage({ stage: "init", runtime: unenforced }).allowed).toBe(
			false,
		);
	});

	test("does not consult a host name when selecting stage behavior", () => {
		expect(enforced).not.toHaveProperty("host");
		expect(unenforced).not.toHaveProperty("name");
		const named = {
			name: "cursor",
			mutationEnforcement: "enforced" as const,
		};
		const result = canStartStage({
			stage: "execute",
			runtime: empty,
			host: named,
		} as never);
		expect(result.allowed).toBe(false);
	});
});
