import { expect, test } from "bun:test";
import { type CheckResult, capabilityPreflight, summarize } from "./preflight";
import { parseRuntimeManifest } from "./runtime-manifest";

test("all required checks passing -> ready (optional failures ignored)", () => {
	const results: CheckResult[] = [
		{ name: "a", ok: true, required: true, detail: "" },
		{ name: "b", ok: false, required: false, detail: "skipped" },
	];
	expect(summarize(results).allRequiredPassed).toBe(true);
});

test("a failing required check -> not ready", () => {
	expect(
		summarize([{ name: "a", ok: false, required: true, detail: "x" }])
			.allRequiredPassed,
	).toBe(false);
});

test("formats one line per check including the detail", () => {
	const s = summarize([
		{
			name: "glab authenticated",
			ok: false,
			required: true,
			detail: "run 'glab auth login'",
		},
	]);
	expect(s.lines).toHaveLength(1);
	expect(s.lines[0]).toContain("glab authenticated");
	expect(s.lines[0]).toContain("run 'glab auth login'");
});

test("stage preflight stops on a missing required capability", () => {
	const runtime = parseRuntimeManifest({ version: 1, capabilities: {} });
	const results = capabilityPreflight("execute", runtime);
	expect(summarize(results).allRequiredPassed).toBe(false);
	expect(results.some((result) => result.name === "mutation.guard" && !result.ok)).toBe(
		true,
	);
	expect(results.find((result) => result.name === "mutation.guard")?.detail).toMatch(
		/runtime manifest/i,
	);
});

test("stage preflight passes when required capabilities are advertised", () => {
	const runtime = parseRuntimeManifest({
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
	const results = capabilityPreflight("execute", runtime);
	expect(summarize(results).allRequiredPassed).toBe(true);
	expect(capabilityPreflight("review", runtime).every((result) => result.ok)).toBe(
		true,
	);
});
