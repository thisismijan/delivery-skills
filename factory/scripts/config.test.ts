import { expect, test } from "bun:test";
import { loadConfig } from "./config";

test("defaults when env is empty", () => {
	const c = loadConfig({});
	expect(c.maxFixAttempts).toBe(2);
	expect(c.modelDefault).toBe("sonnet");
	expect(c.issueSource).toBe("jira");
	expect(c.codeHost).toBe("gitlab");
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

test("throws on an invalid provider", () => {
	expect(() => loadConfig({ ISSUE_SOURCE: "bitbucket" })).toThrow();
});
