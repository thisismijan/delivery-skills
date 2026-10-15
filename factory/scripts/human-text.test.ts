import { expect, test } from "bun:test";
import { sanitizeHumanText } from "./human-text";

test("replaces an em dash surrounded by spaces with a spaced hyphen", () => {
	expect(sanitizeHumanText("review passed — ready to merge")).toBe(
		"review passed - ready to merge",
	);
});

test("replaces a tight em dash (no spaces) with a spaced hyphen", () => {
	expect(sanitizeHumanText("spec ready—see branch")).toBe(
		"spec ready - see branch",
	);
});

test("replaces en dashes too", () => {
	expect(sanitizeHumanText("attempt 1–2")).toBe("attempt 1 - 2");
});

test("leaves ordinary hyphens untouched", () => {
	expect(sanitizeHumanText("SMAI-123 add fireworks-feature")).toBe(
		"SMAI-123 add fireworks-feature",
	);
});

test("trims surrounding whitespace", () => {
	expect(sanitizeHumanText("  hello  ")).toBe("hello");
});

test("handles multiple dashes in one string", () => {
	expect(sanitizeHumanText("a — b — c")).toBe("a - b - c");
});
