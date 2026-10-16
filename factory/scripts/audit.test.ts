import { expect, test } from "bun:test";
import { auditComment } from "./audit";

test("prefixes with the factory marker and the event", () => {
	const c = auditComment("merged", "MR !42 merged; spec archived.");
	expect(c.startsWith("**delivery** · merged")).toBe(true);
	expect(c).toContain("MR !42 merged");
});

test("trims surrounding whitespace in the body", () => {
	expect(auditComment("clarify", "  needs AC  ")).toBe(
		"**delivery** · clarify\n\nneeds AC",
	);
});

test("sanitizes em dashes in the body so the comment reads like a human wrote it", () => {
	const c = auditComment("spec-ready", "spec ready — see branch");
	expect(c).toBe("**delivery** · spec-ready\n\nspec ready - see branch");
	expect(c).not.toContain("—");
});
