import { expect, test } from "bun:test";
import {
	bunInstallCommand,
	bunRuntimeDetail,
	expectedBunVersion,
} from "./bun-runtime";

test("reads the pinned bun version from packageManager", () => {
	expect(expectedBunVersion('{"packageManager":"bun@1.4.2"}')).toBe("1.4.2");
	expect(expectedBunVersion("{")).toBe("");
});

test("install command names the exact pinned version", () => {
	expect(bunInstallCommand("1.4.2")).toBe(
		'curl -fsSL https://bun.sh/install | bash -s "bun-v1.4.2"',
	);
});

test("a present but unpinned runtime is usable and still names the install command", () => {
	const mismatch = bunRuntimeDetail("1.4.2", "1.3.14");
	expect(mismatch.present).toBe(true);
	expect(mismatch.exact).toBe(false);
	expect(mismatch.detail).toContain("bun-v1.4.2");
	expect(mismatch.detail).toContain("1.3.14");
	expect(bunRuntimeDetail("1.4.2", "1.4.2")).toEqual({
		present: true,
		exact: true,
		detail: "1.4.2",
	});
});
