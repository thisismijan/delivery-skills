import { expect, test } from "bun:test";
import { type CheckResult, summarize } from "./preflight";

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
