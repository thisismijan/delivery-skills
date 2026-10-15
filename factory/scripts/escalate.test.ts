import { expect, test } from "bun:test";
import { EscalateError, assertOrEscalate } from "./escalate";

test("passes through a truthy condition", () => {
	expect(() => assertOrEscalate(true, "ok")).not.toThrow();
	expect(() => assertOrEscalate("non-empty", "ok")).not.toThrow();
});

test("throws EscalateError carrying the reason on a falsy condition", () => {
	try {
		assertOrEscalate(false, "no spec on disk");
		throw new Error("should not reach here");
	} catch (e) {
		expect(e).toBeInstanceOf(EscalateError);
		expect((e as EscalateError).reason).toBe("no spec on disk");
	}
});

test("empty string is falsy -> escalates", () => {
	expect(() => assertOrEscalate("", "empty")).toThrow(EscalateError);
});
