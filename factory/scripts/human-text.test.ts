import { describe, expect, test } from "bun:test";
import { sanitizeHumanText } from "./human-text";

describe("sanitizeHumanText", () => {
	const cases: [string, string, string][] = [
		[
			"an em dash with spaces",
			"build green — merge it",
			"build green - merge it",
		],
		[
			"an em dash with no spaces",
			"draft done—see notes",
			"draft done - see notes",
		],
		["an en dash", "pages 3–4", "pages 3 - 4"],
		["several dashes", "x — y – z", "x - y - z"],
		["surrounding whitespace", "\t  padded \n", "padded"],
		["a dash at the end", "trailing —", "trailing -"],
	];
	for (const [label, input, expected] of cases) {
		test(`rewrites ${label}`, () => {
			expect(sanitizeHumanText(input)).toBe(expected);
		});
	}

	test("keeps plain hyphens in keys and compound words", () => {
		const text = "ABC-42 ship the opt-in banner";
		expect(sanitizeHumanText(text)).toBe(text);
	});

	test("never leaves a long dash behind", () => {
		expect(sanitizeHumanText("a—b–c — d")).not.toMatch(/[\u2013\u2014]/);
	});
});
