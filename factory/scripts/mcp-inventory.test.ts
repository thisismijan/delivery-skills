import { expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	DEFAULT_INVENTORY_MAX_AGE_HOURS,
	MCP_INVENTORY_PATH,
	type McpInventory,
	inventoryFreshness,
} from "./mcp-inventory";

const NOW = Date.parse("2026-11-22T12:00:00.000Z");

function inventory(recordedAt: string, tools = 1): McpInventory {
	return {
		version: 1,
		recordedAt,
		tools: Array.from({ length: tools }, (_, index) => ({
			server: "GitLab",
			name: `tool_${index}`,
			status: "ready" as const,
		})),
	};
}

test("a recent, non-empty inventory is reused", () => {
	expect(
		inventoryFreshness(inventory("2026-11-22T09:00:00.000Z"), { nowMs: NOW }),
	).toEqual({
		fresh: true,
		reason: `recorded within ${DEFAULT_INVENTORY_MAX_AGE_HOURS} hours`,
		recordedAt: "2026-11-22T09:00:00.000Z",
		ageHours: 3,
	});
});

test("a missing, old, future-dated, undated, or empty inventory is recorded again", () => {
	expect(inventoryFreshness(null, { nowMs: NOW })).toMatchObject({
		fresh: false,
		reason: "no inventory is recorded",
	});
	expect(
		inventoryFreshness(inventory("2026-11-21T23:00:00.000Z"), { nowMs: NOW }),
	).toMatchObject({ fresh: false, reason: "recorded more than 12 hours ago" });
	expect(
		inventoryFreshness(inventory("2026-11-22T13:00:00.000Z"), { nowMs: NOW }),
	).toMatchObject({
		fresh: false,
		reason: "the recorded time is in the future",
	});
	expect(
		inventoryFreshness(inventory("yesterday"), { nowMs: NOW }),
	).toMatchObject({ fresh: false, reason: "the recorded time is not a date" });
	expect(
		inventoryFreshness(inventory("2026-11-22T11:00:00.000Z", 0), {
			nowMs: NOW,
		}),
	).toMatchObject({ fresh: false, reason: "the recorded inventory is empty" });
	expect(
		inventoryFreshness(inventory("2026-11-22T09:00:00.000Z"), {
			nowMs: NOW,
			maxAgeHours: 2,
		}),
	).toMatchObject({ fresh: false, reason: "recorded more than 2 hours ago" });
});

async function fresh(root: string, ...args: string[]) {
	const child = Bun.spawn(
		["bun", join(import.meta.dir, "mcp-inventory.ts"), "fresh", root, ...args],
		{ stdout: "pipe", stderr: "pipe", env: { ...process.env } },
	);
	const [stdout, code] = await Promise.all([
		new Response(child.stdout).text(),
		child.exited,
	]);
	return { code, result: stdout.trim() ? JSON.parse(stdout) : null };
}

test("fresh exits zero only for a reusable inventory, and a malformed one is recorded again", async () => {
	const root = await mkdtemp(join(tmpdir(), "mcp-inventory-"));
	try {
		expect(await fresh(root)).toMatchObject({
			code: 1,
			result: { fresh: false, reason: "no inventory is recorded" },
		});
		const path = join(root, MCP_INVENTORY_PATH);
		await mkdir(join(root, ".delivery", "runtime"), { recursive: true });
		await writeFile(path, JSON.stringify(inventory(new Date().toISOString())));
		expect(await fresh(root)).toMatchObject({
			code: 0,
			result: { fresh: true },
		});
		await writeFile(path, "{ not json");
		expect(await fresh(root)).toMatchObject({
			code: 1,
			result: { fresh: false },
		});
		expect((await fresh(root, "--max-age-hours", "0")).code).toBe(2);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});
