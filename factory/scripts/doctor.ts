import { constants, existsSync } from "node:fs";
import { access, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { bunRuntimeDetail, expectedBunVersion } from "./bun-runtime";
import {
	AGENT_SUMMARY_PRELOAD_RELATIVE,
	claudeSettingsCarryPreload,
} from "./claude-settings";
import { cursorHooksContainGuard } from "./cursor-settings";
import { loadMcpInventory } from "./mcp-inventory";
import {
	type McpRouteResult,
	mcpFamilyComplete,
	routeMcpInventory,
} from "./mcp-route";
import { credentialState, toolsForProvider } from "./provider-contract";
import {
	type CapabilityId,
	type RuntimeManifest,
	loadRuntimeManifest,
} from "./runtime-manifest";
import {
	SANDBOX_PATH,
	type SandboxCheck,
	checkSandbox,
	realHost,
} from "./sandbox-run";
import { loadConstitution } from "./sdlc-constitution";
import {
	type WorkItemSelectionStatus,
	describeSelection,
	workItemSelectionStatus,
} from "./work-item-config";

// biome-ignore format: workflow contracts require one literal invocation
export const DELIVERY_DOCTOR_INVOCATION = 'scripts/doctor.ts';

export type DoctorCategory =
	| "Ready now"
	| "Needs setup"
	| "Host limitation"
	| "Human-owned";

export interface DoctorCheck {
	category: DoctorCategory;
	name: string;
	detail: string;
	required: boolean;
	ok: boolean;
}

export interface DoctorReport {
	checks: DoctorCheck[];
	coreReady: boolean;
	readOnlyReady: boolean;
	fullLifecycleReady: boolean;
}

export interface FormatDoctorOptions {
	onlyUnresolved?: boolean;
}

export function doctorReadiness(checks: DoctorCheck[]): {
	coreReady: boolean;
	readOnlyReady: boolean;
	fullLifecycleReady: boolean;
} {
	const readOnlyReady = checks.every((check) => !check.required || check.ok);
	const bun = checks.find((check) => check.name === "Bun runtime");
	const mutation = checks.find((check) => check.name === "Mutation guard");
	const fullLifecycleReady =
		readOnlyReady && (bun?.ok ?? true) && (mutation?.ok ?? false);
	return {
		coreReady: readOnlyReady,
		readOnlyReady,
		fullLifecycleReady,
	};
}

type Which = (name: string) => string | null;

async function commandWorks(command: string[], cwd: string): Promise<boolean> {
	const proc = Bun.spawn(command, {
		cwd,
		stdout: "ignore",
		stderr: "ignore",
	});
	return (await proc.exited) === 0;
}

const REMOTE_CAPABILITIES = [
	"forge.change",
	"review.publish",
	"tracker.item",
] as const;

function ready(name: string, detail: string, required = false): DoctorCheck {
	return { category: "Ready now", name, detail, required, ok: true };
}

function setup(name: string, detail: string, required = false): DoctorCheck {
	return { category: "Needs setup", name, detail, required, ok: false };
}

function limitation(name: string, detail: string): DoctorCheck {
	return {
		category: "Host limitation",
		name,
		detail,
		required: false,
		ok: false,
	};
}

function providerLabel(name: string): string {
	if (name === "github") return "GitHub";
	if (name === "gitlab") return "GitLab";
	if (name === "jira") return "Jira";
	return name;
}

export function sessionToolDoctorChecks(route: McpRouteResult): DoctorCheck[] {
	if (route.families.length === 0) {
		return [
			setup(
				"Session tools",
				"optional; record host integration tools during /delivery doctor to use them instead of CLI adapters",
			),
		];
	}
	return route.families.map((family) => {
		const covered = Object.keys(family.operations).sort().join(", ");
		const missing = family.missingOperations.join(", ");
		if (!family.authenticated) {
			return setup(
				`${providerLabel(family.provider)} session tools`,
				"authenticate the host integration, then rerun doctor",
			);
		}
		return mcpFamilyComplete(family)
			? ready(
					`${providerLabel(family.provider)} session tools`,
					`${family.kind} via host tools (${covered})`,
				)
			: setup(
					`${providerLabel(family.provider)} session tools`,
					`${family.kind} host tools cover ${covered}; still need ${missing}`,
				);
	});
}

export function remoteProviderDoctorChecks(
	runtime: RuntimeManifest | null,
	env: Record<string, string | undefined>,
	which: Which,
	route: McpRouteResult = { families: [] },
): DoctorCheck[] {
	if (!runtime) return [];
	const grouped = new Map<
		string,
		Array<(typeof REMOTE_CAPABILITIES)[number]>
	>();
	const unavailable: Array<(typeof REMOTE_CAPABILITIES)[number]> = [];
	const completeFamilies = route.families.filter(mcpFamilyComplete);
	const mcpCapabilities = new Set(
		completeFamilies.flatMap((family) => family.capabilities),
	);
	for (const id of REMOTE_CAPABILITIES) {
		const capability = runtime.capabilities[id as CapabilityId];
		if (capability?.available && capability.provider) {
			const current = grouped.get(capability.provider) ?? [];
			current.push(id);
			grouped.set(capability.provider, current);
			continue;
		}
		if (mcpCapabilities.has(id)) continue;
		unavailable.push(id);
	}

	const checks: DoctorCheck[] = [];
	if (grouped.size === 0) {
		if (
			unavailable.includes("forge.change") ||
			unavailable.includes("review.publish")
		) {
			checks.push(
				setup(
					"Forge and review",
					"install a forge provider with --provider and reinstall",
				),
			);
		}
		if (unavailable.includes("tracker.item")) {
			checks.push(
				setup(
					"Remote work items",
					"optional; local files work without a tracker provider",
				),
			);
		}
	} else {
		for (const [name, capabilities] of grouped) {
			for (const tool of toolsForProvider(name, capabilities)) {
				const path = which(tool);
				checks.push(
					path
						? ready(tool, path)
						: setup(tool, `install ${tool} and add its directory to PATH`),
				);
			}
			const mcpReady = route.families.some(
				(family) => family.provider === name && family.authenticated,
			);
			if (mcpReady) {
				checks.push(
					ready(
						`${providerLabel(name)} credential`,
						"session tools are authenticated",
					),
				);
			} else {
				const credentials = credentialState(name, env);
				const label = `${providerLabel(name)} credential`;
				checks.push(
					credentials.ready
						? ready(label, "present")
						: setup(label, credentials.reasons.join("; ")),
				);
			}
		}
		if (
			unavailable.includes("forge.change") ||
			unavailable.includes("review.publish")
		) {
			checks.push(
				setup(
					"Forge and review",
					"install a forge provider with --provider and reinstall",
				),
			);
		}
		if (unavailable.includes("tracker.item")) {
			checks.push(
				setup(
					"Remote work items",
					"optional; confirm local files or install a tracker provider",
				),
			);
		}
	}
	return checks;
}

export function sandboxDoctorCheck(check: SandboxCheck): DoctorCheck {
	if (check.state === "ready") {
		return ready(
			"Worker sandbox",
			`${check.engine} with ${check.image}; ${check.reasons.join(" ")}`,
		);
	}
	if (check.state === "not-configured") {
		return ready("Worker sandbox", check.reasons.join(" "));
	}
	return setup(
		"Worker sandbox",
		`${check.reasons.join(" ")} Parallel auto stops until this is fixed or ${SANDBOX_PATH} is removed.`,
	);
}

export function workItemDoctorCheck(
	status: WorkItemSelectionStatus,
): DoctorCheck {
	return status.state === "ready"
		? ready(
				"Work-item provider",
				status.selection ? describeSelection(status.selection) : "confirmed",
			)
		: setup(
				"Work-item provider",
				status.remedy ?? "confirm a provider with /delivery init",
			);
}

export async function runDoctor(options: {
	factoryRoot: string;
	cwd: string;
	env?: Record<string, string | undefined>;
	which?: Which;
}): Promise<DoctorReport> {
	const env = options.env ?? process.env;
	const which = options.which ?? ((name) => Bun.which(name));
	const checks: DoctorCheck[] = [];

	let expectedBun = "";
	try {
		expectedBun = expectedBunVersion(
			await readFile(join(options.factoryRoot, "package.json"), "utf8"),
		);
	} catch {
		// The package check below reports the actionable failure.
	}
	const bun = bunRuntimeDetail(expectedBun, Bun.version);
	checks.push(
		bun.exact
			? ready("Bun runtime", bun.detail, true)
			: setup("Bun runtime", bun.detail, !bun.present),
	);

	checks.push(
		existsSync(join(options.factoryRoot, "node_modules", "zod"))
			? ready("Runtime dependencies", "installed", true)
			: setup(
					"Runtime dependencies",
					`run bun install --frozen-lockfile in ${options.factoryRoot}`,
					true,
				),
	);

	try {
		const constitution = loadConstitution(options.factoryRoot);
		checks.push(ready("SDLC constitution", constitution.hash, true));
	} catch (error) {
		checks.push(
			setup(
				"SDLC constitution",
				error instanceof Error ? error.message : String(error),
				true,
			),
		);
	}

	let runtime: RuntimeManifest | null = null;
	const manifestPath = join(options.factoryRoot, "runtime-manifest.json");
	try {
		runtime = await loadRuntimeManifest(manifestPath);
		checks.push(ready("Runtime manifest", manifestPath, true));
	} catch (error) {
		checks.push(
			setup(
				"Runtime manifest",
				`reinstall the pack; ${error instanceof Error ? error.message : String(error)}`,
				true,
			),
		);
	}

	const inGit = await commandWorks(
		["git", "rev-parse", "--is-inside-work-tree"],
		options.cwd,
	);
	checks.push(
		inGit
			? ready("Target repository", options.cwd, true)
			: setup(
					"Target repository",
					"run doctor from the repository delivery should change",
					true,
				),
	);
	try {
		await access(options.cwd, constants.W_OK);
		checks.push(
			ready("Target state", ".delivery and .review can be written", true),
		);
	} catch {
		checks.push(setup("Target state", `${options.cwd} is not writable`, true));
	}
	if (runtime && inGit) {
		try {
			const selection = await workItemSelectionStatus(options.cwd, runtime);
			checks.push(workItemDoctorCheck(selection));
		} catch (error) {
			checks.push(
				setup(
					"Work-item provider",
					`repair .delivery/work-items.json; ${error instanceof Error ? error.message : String(error)}`,
				),
			);
		}
		checks.push(
			sandboxDoctorCheck(checkSandbox(options.cwd, { ...realHost, which })),
		);
	}

	checks.push(
		await mutationGuardDoctorCheck({
			factoryRoot: options.factoryRoot,
			runtime,
			env,
		}),
	);
	const agentSummary = await agentSummaryDoctorCheck({
		factoryRoot: options.factoryRoot,
		runtime,
		env,
	});
	if (agentSummary) checks.push(agentSummary);

	let route: McpRouteResult = { families: [] };
	try {
		route = routeMcpInventory(await loadMcpInventory(options.cwd));
		checks.push(...sessionToolDoctorChecks(route));
	} catch (error) {
		checks.push(
			setup(
				"Session tools",
				`repair .delivery/runtime/mcp-inventory.json; ${error instanceof Error ? error.message : String(error)}`,
				true,
			),
		);
	}
	checks.push(...remoteProviderDoctorChecks(runtime, env, which, route));
	checks.push(
		which("openspec")
			? ready("OpenSpec CLI", which("openspec") ?? "on PATH")
			: setup("OpenSpec CLI", "install OpenSpec before archive"),
	);

	for (const name of [
		"Merge or close a change",
		"Work-item status",
		"Release-risk acceptance",
		"Failed-gate override",
		"Skill install or rollback",
	]) {
		checks.push({
			category: "Human-owned",
			name,
			detail: "requires explicit operator action",
			required: false,
			ok: true,
		});
	}

	return { checks, ...doctorReadiness(checks) };
}

export async function agentSummaryDoctorCheck(options: {
	factoryRoot: string;
	runtime: RuntimeManifest | null;
	env: Record<string, string | undefined>;
}): Promise<DoctorCheck | undefined> {
	const invocation =
		options.runtime?.capabilities["mutation.guard"]?.invocation ?? "";
	if (!invocation.includes("claude-code")) return undefined;
	const settingsPath =
		options.env.CLAUDE_SETTINGS_FILE ??
		join(homedir(), ".claude", "settings.json");
	const preload = join(options.factoryRoot, AGENT_SUMMARY_PRELOAD_RELATIVE);
	let settings: unknown = {};
	try {
		settings = JSON.parse(await readFile(settingsPath, "utf8")) as unknown;
	} catch {
		settings = {};
	}
	if (existsSync(preload) && claudeSettingsCarryPreload(settings, preload)) {
		return ready(
			"Agent status summaries",
			"preload is in Claude settings; restart the Claude daemon if this session started before install",
		);
	}
	return setup(
		"Agent status summaries",
		"rerun the Claude adapter, then restart the Claude daemon so background workers skip the status-line summary",
	);
}

export async function mutationGuardDoctorCheck(options: {
	factoryRoot: string;
	runtime: RuntimeManifest | null;
	env: Record<string, string | undefined>;
}): Promise<DoctorCheck> {
	const guard = options.runtime?.capabilities["mutation.guard"];
	const evidence = existsSync(
		join(options.factoryRoot, ".mutation-guard-enforced"),
	);
	const invocation = guard?.invocation ?? "";
	if (invocation.includes("claude-code")) {
		const settingsPath =
			options.env.CLAUDE_SETTINGS_FILE ??
			join(homedir(), ".claude", "settings.json");
		const live = await fileContains(
			settingsPath,
			join(options.factoryRoot, "scripts", "commit-guard.ts"),
		);
		return guard?.enforcement === "enforced" && evidence && live
			? ready("Mutation guard", invocation)
			: setup(
					"Mutation guard",
					"rerun the Claude adapter to install and verify its PreToolUse hook",
				);
	}
	if (invocation.includes("cursor")) {
		const hooksPath =
			options.env.CURSOR_HOOKS_FILE ?? join(homedir(), ".cursor", "hooks.json");
		let live = false;
		try {
			live = cursorHooksContainGuard(
				JSON.parse(await readFile(hooksPath, "utf8")) as unknown,
				options.factoryRoot,
			);
		} catch {
			live = false;
		}
		return guard?.enforcement === "enforced" && evidence && live
			? ready("Mutation guard", invocation)
			: setup(
					"Mutation guard",
					"rerun the Cursor adapter to install and verify its hooks.json denial hook",
				);
	}
	if (guard?.enforcement === "enforced" && evidence) {
		return ready("Mutation guard", invocation || "verified hook");
	}
	return limitation(
		"Mutation guard",
		"mutating stages stay blocked; reinstall with --adapter cursor or --adapter claude-code to install and verify a denial hook",
	);
}

async function fileContains(path: string, needle: string): Promise<boolean> {
	try {
		return (await readFile(path, "utf8")).includes(needle);
	} catch {
		return false;
	}
}

export function formatDoctorVerdict(report: DoctorReport): string {
	const readiness = doctorReadiness(report.checks);
	if (!readiness.readOnlyReady) {
		return "Read-only lifecycle is not ready. Fix the required items above.";
	}
	if (readiness.fullLifecycleReady) {
		return "Full lifecycle is ready. Human-owned actions still need an operator.";
	}
	const bun = report.checks.find((check) => check.name === "Bun runtime");
	const mutation = report.checks.find(
		(check) => check.name === "Mutation guard",
	);
	const parts = ["Read-only lifecycle is available."];
	if (bun && !bun.ok) {
		parts.push("Install the pinned Bun runtime so gates match package.json.");
	}
	if (mutation && !mutation.ok) {
		parts.push("Mutating stages need a verified denial hook.");
	}
	parts.push("Optional setup items remain above.");
	return parts.join(" ");
}

export function formatDoctorReport(
	report: DoctorReport,
	options: FormatDoctorOptions = {},
): string {
	const categories: DoctorCategory[] = [
		"Ready now",
		"Needs setup",
		"Host limitation",
		"Human-owned",
	];
	const sections = categories
		.map((category) => {
			const rows = report.checks.filter((check) => {
				if (check.category !== category) return false;
				if (options.onlyUnresolved) return !check.ok;
				return true;
			});
			if (rows.length === 0) return "";
			return [
				category.toUpperCase(),
				...rows.map(
					(check) => `${check.ok ? "✓" : "✗"} ${check.name} - ${check.detail}`,
				),
			].join("\n");
		})
		.filter(Boolean);
	return ["Delivery doctor", ...sections, formatDoctorVerdict(report)].join(
		"\n\n",
	);
}

if (import.meta.main) {
	const factoryRoot =
		process.env.DELIVERY_FACTORY_ROOT ?? join(import.meta.dir, "..");
	const report = await runDoctor({
		factoryRoot,
		cwd: process.cwd(),
	});
	console.log(formatDoctorReport(report));
	process.exit(report.readOnlyReady ? 0 : 1);
}
