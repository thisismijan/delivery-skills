import { describe, expect, test } from "bun:test";
import { changeName } from "./change-name";

describe("changeName", () => {
	test("joins the lowercased key and a hyphenated summary", () => {
		expect(changeName("SHOP-77", "Show order history")).toBe(
			"shop-77-show-order-history",
		);
	});

	test("drops punctuation and outer whitespace from the summary", () => {
		expect(changeName("SHOP-77", "   Retry, failed payments?! ")).toBe(
			"shop-77-retry-failed-payments",
		);
	});

	test("falls back to 'change' when the summary has no words", () => {
		expect(changeName("SHOP-5", "")).toBe("shop-5-change");
		expect(changeName("SHOP-5", " !!! ")).toBe("shop-5-change");
	});

	test("keeps only the first six words", () => {
		expect(changeName("QA-3", "a b c d e f g h")).toBe("qa-3-a-b-c-d-e-f");
	});

	test("refuses a key that is malformed or could walk out of a directory", () => {
		expect(() => changeName("../../etc", "x")).toThrow("invalid ticket key");
		expect(() => changeName("Q-3", "single letter prefix")).toThrow(
			"invalid ticket key",
		);
	});

	test("gives the same name for the same inputs every time", () => {
		const first = changeName("SHOP-77", "Show order history");
		expect(changeName("SHOP-77", "Show order history")).toBe(first);
	});
});
