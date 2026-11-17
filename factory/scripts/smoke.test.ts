import { expect, test } from "bun:test";

test("the bun test runner loads a script test and evaluates assertions", () => {
	expect([1, 2, 3].map((n) => n * 2)).toEqual([2, 4, 6]);
});
