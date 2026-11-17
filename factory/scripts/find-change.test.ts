import { describe, expect, test } from "bun:test";
import { findChange } from "./find-change";

describe("findChange", () => {
	test("returns the one directory that belongs to the key", () => {
		expect(findChange("SHOP-77", ["shop-77-order-history", "qa-3-x"])).toEqual({
			match: "shop-77-order-history",
			ambiguous: false,
			candidates: ["shop-77-order-history"],
		});
	});

	test("returns no match and no ambiguity when nothing belongs to the key", () => {
		expect(findChange("SHOP-8", ["shop-77-order-history"])).toEqual({
			match: null,
			ambiguous: false,
			candidates: [],
		});
	});

	test("reports ambiguity instead of guessing between two directories", () => {
		const result = findChange("SHOP-77", ["shop-77-one", "shop-77-two"]);
		expect(result.match).toBeNull();
		expect(result.ambiguous).toBe(true);
		expect(result.candidates).toEqual(["shop-77-one", "shop-77-two"]);
	});

	test("ignores case on both the key and the directory", () => {
		expect(findChange("shop-77", ["SHOP-77-Upper"]).match).toBe(
			"SHOP-77-Upper",
		);
		expect(findChange("shop-77", ["shop-77"]).match).toBe("shop-77");
	});

	test("does not let a longer number match a shorter key", () => {
		expect(findChange("QA-123", ["qa-1234-other"]).match).toBeNull();
	});

	test("skips the archive directory and refuses a traversal key", () => {
		expect(findChange("QA-123", ["archive"]).match).toBeNull();
		expect(() => findChange("../QA-123", ["qa-123-ok"])).toThrow(
			"invalid ticket key",
		);
	});
});
