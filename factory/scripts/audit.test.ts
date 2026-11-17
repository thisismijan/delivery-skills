import { describe, expect, test } from "bun:test";
import { AUDIT_PREFIX, auditComment } from "./audit";

describe("auditComment", () => {
	test("opens with the delivery marker, then the event, then a blank line", () => {
		expect(AUDIT_PREFIX).toBe("**delivery** ·");
		const comment = auditComment("merged", "Merge request !7 landed.");
		expect(comment.startsWith("**delivery** · merged\n\n")).toBe(true);
		expect(comment).toContain("Merge request !7 landed.");
	});

	test("trims the body", () => {
		expect(auditComment("clarify", "\n  which locale?  \n")).toBe(
			"**delivery** · clarify\n\nwhich locale?",
		);
	});

	test("turns a long dash in the body into a plain spaced hyphen", () => {
		const comment = auditComment("spec-ready", "spec written—branch pushed");
		expect(comment).toBe(
			"**delivery** · spec-ready\n\nspec written - branch pushed",
		);
		expect(comment).not.toContain("—");
	});
});
