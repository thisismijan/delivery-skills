import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { z } from "zod";

export const MCP_INVENTORY_PATH = ".delivery/runtime/mcp-inventory.json";

const ToolStatus = z.enum(["ready", "needs-auth", "error"]);

export const McpToolRecord = z
	.object({
		server: z.string().trim().min(1).max(200),
		name: z.string().trim().min(1).max(200),
		status: ToolStatus.default("ready"),
	})
	.strict();
export type McpToolRecord = z.infer<typeof McpToolRecord>;

export const McpInventory = z
	.object({
		version: z.literal(1),
		recordedAt: z.string().trim().min(1),
		tools: z.array(McpToolRecord),
	})
	.strict();
export type McpInventory = z.infer<typeof McpInventory>;

export function parseMcpInventory(input: unknown): McpInventory {
	return McpInventory.parse(input);
}

export function mcpInventoryPath(repositoryRoot: string): string {
	return join(repositoryRoot, MCP_INVENTORY_PATH);
}

export async function loadMcpInventory(
	repositoryRoot: string,
): Promise<McpInventory | null> {
	try {
		return parseMcpInventory(
			JSON.parse(await readFile(mcpInventoryPath(repositoryRoot), "utf8")),
		);
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
		throw error;
	}
}

export async function writeMcpInventory(
	repositoryRoot: string,
	inventory: McpInventory,
): Promise<string> {
	const parsed = parseMcpInventory(inventory);
	const path = mcpInventoryPath(repositoryRoot);
	await mkdir(dirname(path), { recursive: true });
	const temporary = `${path}.${process.pid}.tmp`;
	await writeFile(temporary, `${JSON.stringify(parsed, null, 2)}\n`);
	await rename(temporary, path);
	return path;
}

// A run reuses a recently recorded inventory instead of listing every host tool again. Host tools
// rarely change within a working day, and a planned tool that turns out to be missing triggers a
// fresh recording anyway.
export const DEFAULT_INVENTORY_MAX_AGE_HOURS = 12;
const CLOCK_SKEW_MS = 5 * 60 * 1000;

export interface InventoryFreshness {
	fresh: boolean;
	reason: string;
	recordedAt?: string;
	ageHours?: number;
}

export function inventoryFreshness(
	inventory: McpInventory | null,
	options: { nowMs?: number; maxAgeHours?: number } = {},
): InventoryFreshness {
	const maxAgeHours = options.maxAgeHours ?? DEFAULT_INVENTORY_MAX_AGE_HOURS;
	if (!inventory) return { fresh: false, reason: "no inventory is recorded" };
	const recordedMs = Date.parse(inventory.recordedAt);
	if (Number.isNaN(recordedMs)) {
		return {
			fresh: false,
			reason: "the recorded time is not a date",
			recordedAt: inventory.recordedAt,
		};
	}
	const ageMs = (options.nowMs ?? Date.now()) - recordedMs;
	const ageHours = Math.round((ageMs / 3_600_000) * 10) / 10;
	const base = { recordedAt: inventory.recordedAt, ageHours };
	if (ageMs < -CLOCK_SKEW_MS) {
		return {
			...base,
			fresh: false,
			reason: "the recorded time is in the future",
		};
	}
	if (ageMs > maxAgeHours * 3_600_000) {
		return {
			...base,
			fresh: false,
			reason: `recorded more than ${maxAgeHours} hours ago`,
		};
	}
	if (inventory.tools.length === 0) {
		return { ...base, fresh: false, reason: "the recorded inventory is empty" };
	}
	return {
		...base,
		fresh: true,
		reason: `recorded within ${maxAgeHours} hours`,
	};
}

if (import.meta.main) {
	const [command, repositoryRoot, inputPath] = process.argv.slice(2);
	if (command === "write" && repositoryRoot && inputPath) {
		const path = await writeMcpInventory(
			repositoryRoot,
			parseMcpInventory(await Bun.file(inputPath).json()),
		);
		console.log(path);
	} else if (command === "fresh" && repositoryRoot) {
		const flag = process.argv.indexOf("--max-age-hours");
		const maxAgeHours =
			flag >= 0
				? Number(process.argv[flag + 1])
				: DEFAULT_INVENTORY_MAX_AGE_HOURS;
		if (!Number.isFinite(maxAgeHours) || maxAgeHours <= 0) {
			console.error("--max-age-hours needs a positive number");
			process.exit(2);
		}
		let inventory: McpInventory | null;
		try {
			inventory = await loadMcpInventory(repositoryRoot);
		} catch {
			inventory = null;
		}
		const freshness = inventoryFreshness(inventory, { maxAgeHours });
		console.log(JSON.stringify(freshness));
		process.exit(freshness.fresh ? 0 : 1);
	} else if (command === "read" && repositoryRoot) {
		const inventory = await loadMcpInventory(repositoryRoot);
		if (!inventory) process.exit(1);
		console.log(JSON.stringify(inventory, null, 2));
	} else {
		console.error(
			"usage: mcp-inventory.ts write <repository-root> <inventory.json> | read <repository-root> | fresh <repository-root> [--max-age-hours <n>]",
		);
		process.exit(2);
	}
}
