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

test("empty summary -> key only", () => {
	expect(changeName("PROJ-9", "")).toBe("proj-9");
});

test("caps the slug at 6 words", () => {
	expect(changeName("X-1", "one two three four five six seven eight")).toBe(
		"x-1-one-two-three-four-five-six",
	);
});

test("is stable: same inputs -> same name", () => {
	expect(changeName("PROJ-123", "Add export button")).toBe(
		changeName("PROJ-123", "Add export button"),
	);
});
