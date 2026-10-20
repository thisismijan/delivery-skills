import {
	MCP_CATALOGUES,
	type McpCapabilityId,
	type McpFamilyCatalogue,
} from "./mcp-catalogues";
import type { McpInventory, McpToolRecord } from "./mcp-inventory";

export type McpTransport = "mcp" | "unavailable";

export interface McpMatchedTool {
	server: string;
	name: string;
}

export interface McpOperationPlan {
	transport: "mcp";
	provider: string;
	capability: McpCapabilityId;
	operation: string;
	tool: McpMatchedTool;
	arguments: Record<string, unknown>;
}

export interface McpFamilyRoute {
	provider: string;
	kind: "forge" | "tracker";
	authenticated: boolean;
	capabilities: McpCapabilityId[];
	operations: Record<string, McpOperationPlan>;
	missingOperations: string[];
}

export interface McpRouteResult {
	families: McpFamilyRoute[];
}

function lastSegment(value: string): string {
	return value.split(/__|\//).pop() ?? value;
}

export function toolKeys(name: string): string[] {
	const base = lastSegment(name)
		.toLowerCase()
		.replace(/[^a-z0-9]/g, "");
	const stripped = base
		.replace(/^(mcp)+/, "")
		.replace(/^(gitlab|github|jira|atlassian)+/g, "");
	return [...new Set([base, stripped].filter(Boolean))];
}

function keysOf(names: readonly string[]): Set<string> {
	return new Set(names.flatMap((name) => toolKeys(name)));
}

function serverKeys(server: string): string[] {
	return toolKeys(server);
}

function lookupValue(source: unknown, path: string): unknown {
	const parts = path.split(".");
	let current: unknown = source;
	for (const part of parts) {
		if (typeof current !== "object" || current === null) return undefined;
		current = (current as Record<string, unknown>)[part];
	}
	return current;
}

export function interpolateArguments(
	template: Record<string, unknown> | undefined,
	source: Record<string, unknown>,
): Record<string, unknown> {
	if (!template) return {};
	const mapped: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(template)) {
		if (typeof value !== "string") {
			mapped[key] = value;
			continue;
		}
		if (!value.includes("{{")) {
			mapped[key] = value;
			continue;
		}
		const exact = value.match(/^\{\{([^}]+)\}\}$/);
		if (exact) {
			const resolved = lookupValue(source, exact[1] ?? "");
			if (resolved !== undefined) mapped[key] = resolved;
			continue;
		}
		mapped[key] = value.replace(/\{\{([^}]+)\}\}/g, (_match, path: string) => {
			const resolved = lookupValue(source, path);
			return resolved === undefined ? "" : String(resolved);
		});
	}
	return mapped;
}

function familyMatches(
	catalogue: McpFamilyCatalogue,
	tools: readonly McpToolRecord[],
): boolean {
	const wantedServers = keysOf(catalogue.servers);
	if (
		tools.some((tool) =>
			serverKeys(tool.server).some((key) => wantedServers.has(key)),
		)
	) {
		return true;
	}
	const distinctive = keysOf(
		Object.values(catalogue.operations).flatMap((binding) => [
			...binding.tools,
		]),
	);
	return tools.some((tool) =>
		toolKeys(tool.name).some((key) => distinctive.has(key) && key.length > 6),
	);
}

function readyTools(tools: readonly McpToolRecord[]): McpToolRecord[] {
	return tools.filter(
		(tool) => (tool.status ?? "ready") === "ready" && tool.name !== "mcp_auth",
	);
}

function matchTool(
	bindingTools: readonly string[],
	forbidden: ReadonlySet<string>,
	available: readonly McpToolRecord[],
): McpMatchedTool | undefined {
	const wanted = keysOf(bindingTools);
	for (const tool of available) {
		const keys = toolKeys(tool.name);
		if (keys.some((key) => forbidden.has(key))) continue;
		if (keys.some((key) => wanted.has(key))) {
			return { server: tool.server, name: tool.name };
		}
	}
	return undefined;
}

export function routeMcpInventory(
	inventory: McpInventory | null,
	catalogues: readonly McpFamilyCatalogue[] = MCP_CATALOGUES,
): McpRouteResult {
	if (!inventory) return { families: [] };
	const families: McpFamilyRoute[] = [];
	for (const catalogue of catalogues) {
		const related = inventory.tools.filter(
			(tool) =>
				familyMatches(catalogue, [tool]) ||
				familyMatches(catalogue, inventory.tools),
		);
		if (!familyMatches(catalogue, inventory.tools)) continue;
		const authenticated = readyTools(related).length > 0;
		const available = readyTools(
			related.length > 0 ? related : inventory.tools,
		);
		const forbidden = keysOf(catalogue.forbidden);
		const operations: Record<string, McpOperationPlan> = {};
		const missingOperations: string[] = [];
		for (const [operation, binding] of Object.entries(catalogue.operations)) {
			const tool = matchTool(binding.tools, forbidden, available);
			if (!tool) {
				missingOperations.push(operation);
				continue;
			}
			const capability: McpCapabilityId =
				catalogue.capabilities.includes("review.publish") &&
				(operation === "note" || operation === "reply")
					? "review.publish"
					: (catalogue.capabilities[0] ??
						(catalogue.kind === "tracker" ? "tracker.item" : "forge.change"));
			operations[operation] = {
				transport: "mcp",
				provider: catalogue.provider,
				capability,
				operation,
				tool,
				arguments: binding.arguments ?? {},
			};
		}
		families.push({
			provider: catalogue.provider,
			kind: catalogue.kind,
			authenticated,
			capabilities: [...catalogue.capabilities],
			operations,
			missingOperations,
		});
	}
	return { families };
}

export function mcpFamily(
	route: McpRouteResult,
	kind: "forge" | "tracker",
	provider?: string,
): McpFamilyRoute | undefined {
	return route.families.find(
		(family) =>
			family.kind === kind &&
			family.authenticated &&
			(provider === undefined || family.provider === provider),
	);
}

export function planMcpOperation(options: {
	route: McpRouteResult;
	kind: "forge" | "tracker";
	operation: string;
	provider?: string;
	input?: Record<string, unknown>;
}): McpOperationPlan | undefined {
	const family = mcpFamily(options.route, options.kind, options.provider);
	const planned = family?.operations[options.operation];
	if (!planned) return undefined;
	return {
		...planned,
		arguments: interpolateArguments(planned.arguments, options.input ?? {}),
	};
}

export function trackerProvidersFromMcp(route: McpRouteResult): string[] {
	return [
		...new Set(
			route.families
				.filter(
					(family) =>
						family.kind === "tracker" &&
						family.authenticated &&
						["list", "read", "create", "link", "note"].every(
							(operation) => family.operations[operation],
						),
				)
				.map((family) => family.provider),
		),
	];
}

if (import.meta.main) {
	const [command, inventoryPath, kind, operation, inputPath] =
		process.argv.slice(2);
	if (command !== "plan" || !inventoryPath || !kind || !operation) {
		console.error(
			"usage: mcp-route.ts plan <inventory.json> <forge|tracker> <operation> [input.json]",
		);
		process.exit(2);
	}
	const inventory = await Bun.file(inventoryPath).json();
	const input = inputPath
		? ((await Bun.file(inputPath).json()) as Record<string, unknown>)
		: {};
	const planned = planMcpOperation({
		route: routeMcpInventory(inventory),
		kind: kind as "forge" | "tracker",
		operation,
		input,
	});
	if (!planned) {
		console.error(`No session tool mapping for ${kind} ${operation}.`);
		process.exit(1);
	}
	console.log(JSON.stringify(planned, null, 2));
}
