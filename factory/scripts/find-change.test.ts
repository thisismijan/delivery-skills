import { expect, test } from "bun:test";
import { findChange } from "./find-change";

test("exactly one match -> match", () => {
	const r = findChange("PROJ-123", ["proj-123-add-export", "other-1-x"]);
	expect(r.match).toBe("proj-123-add-export");
	expect(r.ambiguous).toBe(false);
});

test("no match -> null, not ambiguous", () => {
	const r = findChange("PROJ-9", ["proj-123-add-export"]);
	expect(r.match).toBeNull();
	expect(r.ambiguous).toBe(false);
});

test("more than one match -> ambiguous, no single match", () => {
	const r = findChange("PROJ-123", ["proj-123-a", "proj-123-b"]);
	expect(r.match).toBeNull();
	expect(r.ambiguous).toBe(true);
	expect(r.candidates.length).toBe(2);
});

test("key match is case-insensitive", () => {
	expect(findChange("proj-123", ["PROJ-123-x"]).match).toBe("PROJ-123-x");
});

test("ticket key matching respects the numeric boundary", () => {
	expect(findChange("MDF-1234", ["mdf-12345-other"]).match).toBeNull();
});

test("archive is never treated as a change and traversal keys are rejected", () => {
	expect(findChange("MDF-1234", ["archive"]).match).toBeNull();
	expect(() => findChange("../MDF-1234", ["mdf-1234-safe"])).toThrow(
		"invalid ticket key",
	);
});
