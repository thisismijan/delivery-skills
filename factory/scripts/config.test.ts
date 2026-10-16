import { expect, test } from "bun:test";
import { loadConfig } from "./config";

test("defaults when env is empty", () => {
	const c = loadConfig({});
	expect(c.maxFixAttempts).toBe(2);
	expect(c.modelDefault).toBe("sonnet");
	expect(c.issueSource).toBeUndefined();
	expect(c.codeHost).toBeUndefined();
	expect(c.specTool).toBeUndefined();
});

test("accepts generic provider ids or leaves them absent", () => {
	const c = loadConfig({
		ISSUE_SOURCE: "tracker-a",
		CODE_HOST: "forge-b",
		SPEC_TOOL: "spec-c",
	});
	expect(c.issueSource).toBe("tracker-a");
	expect(c.codeHost).toBe("forge-b");
	expect(c.specTool).toBe("spec-c");
});

test("reads MAX_FIX_ATTEMPTS from env", () => {
	expect(loadConfig({ MAX_FIX_ATTEMPTS: "3" }).maxFixAttempts).toBe(3);
});

test("throws on a non-positive fix-attempt count (fail closed)", () => {
	expect(() => loadConfig({ MAX_FIX_ATTEMPTS: "0" })).toThrow();
});

test("throws on a non-numeric fix-attempt count", () => {
	expect(() => loadConfig({ MAX_FIX_ATTEMPTS: "abc" })).toThrow();
});

test("throws on an empty provider id", () => {
	expect(() => loadConfig({ ISSUE_SOURCE: "" })).toThrow();
});
