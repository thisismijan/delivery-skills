import { describe, expect, test } from "bun:test";
import { loadModelCatalogue, resolveAvailableModel } from "./model-catalogue";
import {
	type RuntimeManifest,
	advertisedModels,
	capabilityResult,
	lookupCapability,
	missingCapabilitiesForStage,
	missingCapability,
	parseRuntimeManifest,
} from "./runtime-manifest";
import { canStartStage } from "./stage-gating";

function manifest(
	capabilities: RuntimeManifest["capabilities"],
): RuntimeManifest {
	return parseRuntimeManifest({ version: 1, capabilities });
}

function mutation(
	enforcement: "enforced" | "unenforced" | "unknown",
	invocation = "hook.pre-mutation",
) {
	return {
		available: true,
		mode: "native" as const,
		invocation,
		enforcement,
	};
}

describe("runtime manifest validation", () => {
	test("accepts a versioned manifest of known capabilities", () => {
		const runtime = manifest({
			"process.run": {
				available: true,
				mode: "native",
				invocation: "subprocess.run",
			},
			"mutation.guard": mutation("enforced"),
		});
		expect(runtime.version).toBe(1);
		expect(lookupCapability(runtime, "process.run")?.invocation).toBe(
			"subprocess.run",
		);
	});

	test("rejects an unknown manifest version", () => {
		expect(() =>
			parseRuntimeManifest({ version: 2, capabilities: {} }),
		).toThrow();
	});

	test("rejects a vendor-specific capability identifier", () => {
		expect(() =>
			parseRuntimeManifest({
				version: 1,
				capabilities: {
					"gitlab.merge": {
						available: true,
						mode: "native",
						invocation: "glab mr create",
					},
				},
			}),
		).toThrow();
	});

	test("rejects an available capability with no invocation reference", () => {
		expect(() =>
			parseRuntimeManifest({
				version: 1,
				capabilities: {
					"process.run": { available: true, mode: "native" },
				},
			}),
		).toThrow();
	});
});

describe("capability lookup and missing-capability errors", () => {
	test("returns the advertised descriptor", () => {
		const runtime = manifest({
			"forge.change": {
				available: true,
				mode: "adapter",
				invocation: "forge.open-change",
			},
		});
		expect(lookupCapability(runtime, "forge.change")).toEqual({
			available: true,
			mode: "adapter",
			invocation: "forge.open-change",
		});
		expect(capabilityResult(runtime, "forge.change").ok).toBe(true);
	});

	test("names the missing capability and a configuration-oriented remedy", () => {
		const runtime = manifest({});
		const missing = missingCapability("tracker.item");
		expect(missing.capability).toBe("tracker.item");
		expect(missing.remedy).toMatch(/runtime manifest/i);
		expect(missing.remedy).toMatch(/adapter|local work/i);
		expect(capabilityResult(runtime, "tracker.item")).toEqual({
			capability: "tracker.item",
			ok: false,
			reason: missing.remedy,
		});
		expect(
			missingCapabilitiesForStage("draft", runtime).some(
				(item) => item.capability === "mutation.guard",
			),
		).toBe(true);
	});
});

describe("equivalent-host behavior", () => {
	test("two hosts with equivalent manifests select the same lifecycle behavior", () => {
		const alpha = manifest({
			"mutation.guard": mutation("enforced", "alpha.pre-mutation"),
			"model.inventory": {
				available: true,
				mode: "native",
				invocation: "alpha.models",
			},
		});
		const beta = manifest({
			"mutation.guard": {
				available: true,
				mode: "adapter",
				invocation: "beta.hooks.mutation",
				enforcement: "enforced",
			},
			"model.inventory": {
				available: true,
				mode: "adapter",
				invocation: "beta.models",
			},
		});
		expect(canStartStage({ stage: "execute", runtime: alpha })).toEqual(
			canStartStage({ stage: "execute", runtime: beta }),
		);
		expect(canStartStage({ stage: "review", runtime: alpha })).toEqual(
			canStartStage({ stage: "review", runtime: beta }),
		);
		expect(canStartStage({ stage: "execute", runtime: alpha }).allowed).toBe(
			true,
		);
	});
});

describe("mutation enforcement", () => {
	test("refuses a mutating stage when the guard is absent and still allows read-only stages", () => {
		const runtime = manifest({});
		const execute = canStartStage({ stage: "execute", runtime });
		expect(execute.allowed).toBe(false);
		expect(execute.reason).toMatch(/mutation|manifest/i);
		expect(canStartStage({ stage: "review", runtime }).allowed).toBe(true);
		expect(canStartStage({ stage: "status", runtime }).allowed).toBe(true);
	});

	test("refuses a mutating stage when the advertised guard is not enforceable", () => {
		const unenforced = manifest({ "mutation.guard": mutation("unenforced") });
		const unknown = manifest({ "mutation.guard": mutation("unknown") });
		expect(canStartStage({ stage: "draft", runtime: unenforced }).allowed).toBe(
			false,
		);
		expect(canStartStage({ stage: "execute", runtime: unknown }).allowed).toBe(
			false,
		);
		expect(
			canStartStage({ stage: "review", runtime: unenforced }).allowed,
		).toBe(true);
	});

	test("allows a mutating stage only when the guard is enforceable", () => {
		const runtime = manifest({ "mutation.guard": mutation("enforced") });
		expect(canStartStage({ stage: "execute", runtime }).allowed).toBe(true);
		expect(canStartStage({ stage: "draft", runtime }).allowed).toBe(true);
		expect(canStartStage({ stage: "not-a-stage", runtime }).allowed).toBe(
			false,
		);
	});

	test("auto also requires isolated agent dispatch", () => {
		const guarded = manifest({ "mutation.guard": mutation("enforced") });
		expect(canStartStage({ stage: "auto", runtime: guarded })).toMatchObject({
			allowed: false,
		});
		const isolated = manifest({
			"mutation.guard": mutation("enforced"),
			"agent.dispatch": {
				available: true,
				mode: "native",
				invocation: "agent.dispatch.isolated-cwd-env",
			},
		});
		expect(canStartStage({ stage: "auto", runtime: isolated })).toEqual({
			allowed: true,
		});
	});
});

describe("advertised model resolution", () => {
	test("resolves the first live catalogue candidate the runtime advertises", async () => {
		const catalogue = await loadModelCatalogue();
		const runtime = manifest({
			"model.inventory": {
				available: true,
				mode: "native",
				invocation: "runtime.models",
				models: ["claude-sonnet-5-5-medium", "muse-wonder-1.0-high"],
			},
		});
		const inventory = {
			version: 1 as const,
			recordedAt: "2026-10-16T12:00:00.000Z",
			models: advertisedModels(runtime),
		};
		expect(resolveAvailableModel(catalogue, "frontier", inventory)).toEqual({
			tier: "frontier",
			model: "muse-wonder-1.0-high",
			availability: "live",
		});
	});

	test("stops rather than inventing an identifier when the required tier is missing", async () => {
		const catalogue = await loadModelCatalogue();
		const inventory = {
			version: 1 as const,
			recordedAt: "2026-10-16T12:00:00.000Z",
			models: ["unrelated-fast-model"],
		};
		expect(() =>
			resolveAvailableModel(catalogue, "frontier", inventory),
		).toThrow(/no live frontier model/i);
		expect(() =>
			resolveAvailableModel(catalogue, "frontier", inventory),
		).not.toThrow(/cursor|claudeCode/i);
	});
});
