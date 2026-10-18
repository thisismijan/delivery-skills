import { describe, expect, test } from "bun:test";
import {
	type ProviderDescriptor,
	invokeProvider,
	missingProvider,
	readForgeChange,
	readTrackerItem,
	readWorkItem,
} from "./providers";

const absentForge: ProviderDescriptor = { kind: "forge", mode: "absent" };
const fakeForge: ProviderDescriptor = {
	kind: "forge",
	mode: "available",
	invocation: "fake.forge.change",
};
const absentTracker: ProviderDescriptor = { kind: "tracker", mode: "absent" };
const fakeTracker: ProviderDescriptor = {
	kind: "tracker",
	mode: "available",
	invocation: "fake.tracker.item",
};

describe("normalized providers", () => {
	test("an absent forge, tracker, review, subprocess, or subagent fails closed", () => {
		for (const kind of [
			"forge",
			"tracker",
			"review",
			"subprocess",
			"subagent",
		] as const) {
			const result = invokeProvider({ kind, mode: "absent" }, () => ({
				ok: true,
				value: { id: "should-not-run" },
			}));
			expect(result).toEqual(missingProvider(kind));
			expect(result.ok).toBe(false);
			expect(result.reason).toBe("missing-provider");
		}
	});

	test("a missing tracker keeps local work items from requiring a product", () => {
		const result = readTrackerItem(absentTracker, () => ({
			ok: true,
			item: { key: "LOCAL-1" },
		}));
		expect(result.ok).toBe(false);
		expect(result.reason).toBe("missing-provider");
		expect(result.value).toBeUndefined();
	});

	test("a missing forge stops at the merge-request boundary", () => {
		const result = readForgeChange(absentForge, () => ({
			ok: true,
			change: { id: "12" },
		}));
		expect(result.ok).toBe(false);
		expect(result.reason).toBe("missing-provider");
		expect(result.message).toMatch(/preserves completed work/i);
	});

	test("a fake tracker returns a normalized work item", () => {
		const result = readWorkItem(fakeTracker, () => ({
			ok: true,
			item: { key: "WORK-21" },
		}));
		expect(result).toEqual({
			ok: true,
			provider: "tracker",
			value: { key: "WORK-21" },
		});
	});

	test("a fake forge returns a normalized change id", () => {
		const result = readForgeChange(fakeForge, () => ({
			ok: true,
			change: { id: "84" },
		}));
		expect(result).toEqual({
			ok: true,
			provider: "forge",
			value: { id: "84" },
		});
	});

	test("a fake tracker that returns no key fails closed", () => {
		const result = readTrackerItem(fakeTracker, () => ({ ok: true }));
		expect(result.ok).toBe(false);
		expect(result.reason).toBe("invalid-result");
	});

	test("a failed subprocess provider does not run the probe", () => {
		let called = 0;
		const result = invokeProvider(
			{ kind: "subprocess", mode: "failed" },
			() => {
				called += 1;
				return { ok: true, value: "ran" };
			},
		);
		expect(called).toBe(0);
		expect(result.ok).toBe(false);
		expect(result.reason).toBe("provider-failed");
	});

	test("an available review provider returns the normalized publication result", () => {
		const result = invokeProvider(
			{ kind: "review", mode: "available", invocation: "fake.review.publish" },
			() => ({ ok: true, value: { published: true } }),
		);
		expect(result).toEqual({
			ok: true,
			provider: "review",
			value: { published: true },
		});
	});
});
