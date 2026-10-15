import { expect, test } from "bun:test";
import { mrTitle } from "./mr-title";

test("prefixes the title with the Jira key and a spaced hyphen", () => {
	expect(mrTitle("SMAI-123", "Add new fireworks feature")).toBe(
		"SMAI-123 - Add new fireworks feature",
	);
});

test("does not double-prefix when the summary already starts with the key", () => {
	expect(mrTitle("SMAI-123", "SMAI-123 - Add fireworks")).toBe(
		"SMAI-123 - Add fireworks",
	);
});

test("uppercases the key so the reference is consistent", () => {
	expect(mrTitle("smai-123", "Add fireworks")).toBe("SMAI-123 - Add fireworks");
});

test("sanitizes em dashes in the summary", () => {
	expect(mrTitle("SMAI-9", "Refactor — split module")).toBe(
		"SMAI-9 - Refactor - split module",
	);
});

test("trims a noisy summary", () => {
	expect(mrTitle("SMAI-1", "  Tidy up  ")).toBe("SMAI-1 - Tidy up");
});

test("throws on an empty Jira key (fail closed)", () => {
	expect(() => mrTitle("", "Add fireworks")).toThrow();
});

test("throws on an empty summary (fail closed)", () => {
	expect(() => mrTitle("SMAI-1", "   ")).toThrow();
});
