import { describe, expect, test } from "bun:test";
import { EscalateError, assertOrEscalate } from "./escalate";

function thrownBy(run: () => void): unknown {
	try {
		run();
	} catch (error) {
		return error;
	}
	return undefined;
}

describe("assertOrEscalate", () => {
	test("returns quietly for truthy conditions", () => {
		for (const condition of [true, "text", 1, {}, []]) {
			expect(thrownBy(() => assertOrEscalate(condition, "fine"))).toBe(
				undefined,
			);
		}
	});

	test("throws an EscalateError that carries the reason", () => {
		const error = thrownBy(() => assertOrEscalate(false, "spec missing"));
		expect(error).toBeInstanceOf(EscalateError);
		expect(error).toBeInstanceOf(Error);
		expect((error as EscalateError).reason).toBe("spec missing");
		expect((error as EscalateError).message).toBe("spec missing");
		expect((error as EscalateError).name).toBe("EscalateError");
	});

	test("treats every falsy value, including the empty string, as a failure", () => {
		for (const condition of ["", 0, null, undefined, Number.NaN]) {
			expect(() => assertOrEscalate(condition, "falsy")).toThrow(EscalateError);
		}
	});
});
