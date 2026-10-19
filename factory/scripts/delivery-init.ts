import { lstat, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { type DoctorReport, formatDoctorReport, runDoctor } from "./doctor";
import { loadRuntimeManifest } from "./runtime-manifest";
import type { RuntimeManifest } from "./runtime-manifest";
import {
	type ProviderSettings,
	type WorkItemSelectionStatus,
	configureWorkItemProvider,
	describeSelection,
	parseSettingArguments,
	workItemOptions,
	workItemSelectionStatus,
} from "./work-item-config";

// biome-ignore format: workflow contracts require one literal invocation
export const DELIVERY_INIT_INVOCATION = 'scripts/delivery-init.ts';

const DELIVERY_IGNORES = [".delivery/", ".review/"] as const;

export function withDeliveryIgnores(input: string): string {
	const lines = input.split(/\r?\n/);
	const existing = new Set(lines.map((line) => line.trim()));
	const output = input.length === 0 ? [] : [...lines];
	while (output.at(-1) === "") output.pop();
	for (const entry of DELIVERY_IGNORES) {
		if (!existing.has(entry)) output.push(entry);
	}
	return `${output.join("\n")}\n`;
}

async function repositoryRoot(cwd: string): Promise<string> {
	const proc = Bun.spawn(["git", "rev-parse", "--show-toplevel"], {
		cwd,
		stdout: "pipe",
		stderr: "pipe",
	});
	const [stdout, stderr, code] = await Promise.all([
		new Response(proc.stdout).text(),
		new Response(proc.stderr).text(),
		proc.exited,
	]);
	if (code !== 0) {
		throw new Error(
			`run delivery init inside the target git repository${stderr.trim() ? `: ${stderr.trim()}` : ""}`,
		);
	}
	return stdout.trim();
}

export async function initializeTargetRepository(
	cwd: string,
	workItems?: {
		providerId: string;
		runtime: RuntimeManifest;
		replace?: boolean;
		settings?: ProviderSettings;
	},
): Promise<string> {
	const root = await repositoryRoot(cwd);
	const ignorePath = join(root, ".gitignore");
	try {
		if ((await lstat(ignorePath)).isSymbolicLink()) {
			throw new Error("refusing to write a symlinked .gitignore");
		}
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
	}
	let current = "";
	try {
		current = await readFile(ignorePath, "utf8");
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
	}
	const next = withDeliveryIgnores(current);
	if (next !== current) await writeFile(ignorePath, next);
	if (workItems) {
		await configureWorkItemProvider({
			repositoryRoot: root,
			providerId: workItems.providerId,
			runtime: workItems.runtime,
			replace: workItems.replace,
			settings: workItems.settings,
		});
	}
	return root;
}

export function formatInitHandoff(options: {
	root: string;
	selection: WorkItemSelectionStatus;
	runtime: RuntimeManifest;
	doctor: DoctorReport;
}): string {
	const unresolved = formatDoctorReport(options.doctor, {
		onlyUnresolved: true,
	});
	return [
		unresolved,
		"",
		`Target repository initialized: ${options.root}`,
		options.selection.state === "ready" && options.selection.selection
			? `Work-item provider: ${describeSelection(options.selection.selection)}`
			: "Work-item provider confirmation required:",
		...(options.selection.state === "ready"
			? []
			: workItemOptions(options.runtime).map(
					(option) => `  ${option.id}: ${option.label}`,
				)),
		...(options.selection.state === "ready"
			? []
			: [
					"Run again with --work-items <provider-id> after confirming the choice.",
				]),
		"First commands:",
		"  /delivery help",
		"  /delivery discover <idea>",
		"  /delivery status",
	].join("\n");
}

if (import.meta.main) {
	try {
		const args = process.argv.slice(2);
		const providerIndex = args.indexOf("--work-items");
		const providerId = providerIndex >= 0 ? args[providerIndex + 1] : undefined;
		if (providerIndex >= 0 && !providerId) {
			throw new Error("--work-items requires a provider id");
		}
		const factoryRoot =
			process.env.DELIVERY_FACTORY_ROOT ?? join(import.meta.dir, "..");
		const runtime = await loadRuntimeManifest(
			join(factoryRoot, "runtime-manifest.json"),
		);
		const root = await initializeTargetRepository(
			process.cwd(),
			providerId
				? {
						providerId,
						runtime,
						replace: args.includes("--replace"),
						settings: parseSettingArguments(args),
					}
				: undefined,
		);
		const selection = await workItemSelectionStatus(root, runtime);
		const doctor = await runDoctor({
			factoryRoot,
			cwd: root,
		});
		console.log(
			formatInitHandoff({
				root,
				selection,
				runtime,
				doctor,
			}),
		);
		process.exit(doctor.readOnlyReady && selection.state === "ready" ? 0 : 1);
	} catch (error) {
		console.error(error instanceof Error ? error.message : String(error));
		process.exit(1);
	}
}
