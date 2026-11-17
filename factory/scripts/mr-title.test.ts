import { describe, expect, test } from "bun:test";
import { mrTitle } from "./mr-title";

describe("mrTitle", () => {
	test("puts the key first, then a spaced hyphen, then the summary", () => {
		expect(mrTitle("SHOP-77", "Show order history")).toBe(
			"SHOP-77 - Show order history",
		);
	});

	test("leaves a summary that already leads with the key as it is", () => {
		expect(mrTitle("SHOP-77", "SHOP-77 - Show history")).toBe(
			"SHOP-77 - Show history",
		);
		expect(mrTitle("shop-77", "shop-77 show history")).toBe(
			"shop-77 show history",
		);
	});

	test("writes the key in upper case", () => {
		expect(mrTitle("shop-77", "Show history")).toBe("SHOP-77 - Show history");
	});

	test("turns a long dash in the summary into a spaced hyphen", () => {
		expect(mrTitle("QA-3", "Split parser — keep API")).toBe(
			"QA-3 - Split parser - keep API",
		);
	});

	test("trims the summary", () => {
		expect(mrTitle("QA-3", "\t Rename flag \n")).toBe("QA-3 - Rename flag");
	});

	test("refuses to build a title without a key", () => {
		expect(() => mrTitle("", "Show history")).toThrow(
			"mr-title: Jira key is required",
		);
	});

	test("treats a whitespace-only key as missing", () => {
		expect(() => mrTitle("  ", "Show history")).toThrow(
			"mr-title: Jira key is required",
		);
	});

	test("refuses to build a title without a summary", () => {
		expect(() => mrTitle("QA-3", "  \n ")).toThrow(
			"mr-title: summary is required",
		);
	});
});
