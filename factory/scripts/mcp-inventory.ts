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

if (import.meta.main) {
	const [command, repositoryRoot, inputPath] = process.argv.slice(2);
	if (command === "write" && repositoryRoot && inputPath) {
		const path = await writeMcpInventory(
			repositoryRoot,
			parseMcpInventory(await Bun.file(inputPath).json()),
		);
		console.log(path);
	} else if (command === "read" && repositoryRoot) {
		const inventory = await loadMcpInventory(repositoryRoot);
		if (!inventory) process.exit(1);
		console.log(JSON.stringify(inventory, null, 2));
	} else {
		console.error(
			"usage: mcp-inventory.ts write <repository-root> <inventory.json> | read <repository-root>",
		);
		process.exit(2);
	}
}
