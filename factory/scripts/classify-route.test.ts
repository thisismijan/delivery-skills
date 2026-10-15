import { expect, test } from "bun:test";
import { classifyRoute } from "./classify-route";

// ---------------------------------------------------------------------------
// classifyRoute — maps a classification string to its action group.
//
// Contract pinned for the implementer (scripts/classify-route.ts must export):
//
//   export type Classification =
//     | "bug"
//     | "non-functional"
//     | "nitpick"
//     | "false-positive"
//     | "question"
//     | "outdated";
//
//   export type ActionGroup = "action" | "dispute" | "answer" | "skip";
//
//   export function classifyRoute(classification: string): ActionGroup
//     -- fail-closed: throws (does NOT default to any group) on an invalid/unknown
//     classification value. The caller must validate the input with the
//     ClassificationVerdict Zod schema before calling this function.
//
// Routing table:
//   bug            -> "action"   (tests-first fix)
//   non-functional -> "action"   (green-gate fix, no new test required)
//   nitpick        -> "dispute"  (reasoned reply, no code change)
//   false-positive -> "dispute"  (reasoned reply, no code change)
//   question       -> "answer"   (reply; code change only if required)
//   outdated       -> "skip"     (no reply, no code change)
// ---------------------------------------------------------------------------

test("bug -> action", () => {
	expect(classifyRoute("bug")).toBe("action");
});

test("non-functional -> action", () => {
	expect(classifyRoute("non-functional")).toBe("action");
});

test("nitpick -> dispute", () => {
	expect(classifyRoute("nitpick")).toBe("dispute");
});

test("false-positive -> dispute", () => {
	expect(classifyRoute("false-positive")).toBe("dispute");
});

test("question -> answer", () => {
	expect(classifyRoute("question")).toBe("answer");
});

test("outdated -> skip", () => {
	expect(classifyRoute("outdated")).toBe("skip");
});

// Fail-closed: unknown/invalid values must throw, never silently default.

test("fail closed: unknown classification throws (does not default to action)", () => {
	expect(() => classifyRoute("enhancement")).toThrow();
});

test("fail closed: empty string throws", () => {
	expect(() => classifyRoute("")).toThrow();
});

test("fail closed: 'resolved' (not a valid class) throws", () => {
	expect(() => classifyRoute("resolved")).toThrow();
});

test("fail closed: uppercase variant throws (enum is case-sensitive)", () => {
	expect(() => classifyRoute("Bug")).toThrow();
	expect(() => classifyRoute("BUG")).toThrow();
});

test("fail closed: null-ish string 'null' throws", () => {
	expect(() => classifyRoute("null")).toThrow();
});
