import { expect, test } from "bun:test";
import { changeName } from "./change-name";

test("combines lowercased key with slugified summary", () => {
	expect(changeName("PROJ-123", "Add export button")).toBe(
		"proj-123-add-export-button",
	);
});

test("strips punctuation and trims", () => {
	expect(changeName("PROJ-123", "  Fix the Bug!! ")).toBe(
		"proj-123-fix-the-bug",
	);
});

test("empty summary uses a safe fallback slug", () => {
	expect(changeName("PROJ-9", "")).toBe("proj-9-change");
});

test("caps the slug at 6 words", () => {
	expect(changeName("XY-1", "one two three four five six seven eight")).toBe(
		"xy-1-one-two-three-four-five-six",
	);
});

test("rejects malformed or traversal-like keys", () => {
	expect(() => changeName("../../tmp", "escape")).toThrow("invalid ticket key");
	expect(() => changeName("X-1", "too short")).toThrow("invalid ticket key");
});

test("is stable: same inputs -> same name", () => {
	expect(changeName("PROJ-123", "Add export button")).toBe(
		changeName("PROJ-123", "Add export button"),
	);
});
