import { expect, test } from "bun:test";
import { providerFailureMessage, safeProviderError } from "./provider-error";

test("keeps one actionable provider error line", () => {
	expect(
		providerFailureMessage({
			subject: "The forge provider",
			operation: "create",
			code: 1,
			stderr:
				"Cannot determine the GitLab project from the repository origin; set GL_PROJECT.\nstack details",
		}),
	).toBe(
		"The forge provider failed create (exit 1): Cannot determine the GitLab project from the repository origin; set GL_PROJECT.",
	);
});

test("redacts credentials before presenting provider errors", () => {
	const error = safeProviderError(
		"token=glpat-secret https://user:password@example.test/project",
	);
	expect(error).toContain("[credential redacted]");
	expect(error).toContain("https://[redacted]@example.test/project");
	expect(error).not.toContain("glpat-secret");
	expect(error).not.toContain("password");
});

test("omits empty provider stderr", () => {
	expect(safeProviderError("\n")).toBeUndefined();
});
