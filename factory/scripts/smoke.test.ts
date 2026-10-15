import { expect, test } from "bun:test";

// N0 smoke check: proves the Bun test harness for the deterministic
// gate scripts (N1: test-gate.ts, verify-change.ts) runs.
test("scripts test harness works", () => {
	expect(1 + 1).toBe(2);
});
