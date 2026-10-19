import { constants, existsSync } from "node:fs";
import { access, readFile } from "node:fs/promises";
import { join } from "node:path";
import { type RuntimeManifest, loadRuntimeManifest } from "./runtime-manifest";
import { loadConstitution } from "./sdlc-constitution";
import {
	type WorkItemSelectionStatus,
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

function credentialPresent(env: Record<string, string | undefined>): boolean {
	if (env.GITLAB_TOKEN?.trim()) return true;
	if (env.GL_TOKEN_FILE && existsSync(env.GL_TOKEN_FILE)) return true;
	return Boolean(env.HOME && existsSync(join(env.HOME, "token")));
}

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

export function workItemDoctorCheck(
	status: WorkItemSelectionStatus,
): DoctorCheck {
	return status.state === "ready"
		? ready("Work-item provider", status.selection?.provider.id ?? "confirmed")
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
		const pkg = JSON.parse(
			await readFile(join(options.factoryRoot, "package.json"), "utf8"),
		) as { packageManager?: string };
		expectedBun = pkg.packageManager?.replace(/^bun@/, "") ?? "";
	} catch {
		// The package check below reports the actionable failure.
	}
	checks.push(
		Bun.version === expectedBun
			? ready("Bun runtime", Bun.version, true)
			: setup(
					"Bun runtime",
					`install Bun ${expectedBun || "from package.json"}; found ${Bun.version}`,
					true,
				),
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
	}

	const guard = runtime?.capabilities["mutation.guard"];
	const evidence = existsSync(
		join(options.factoryRoot, ".mutation-guard-enforced"),
	);
	if (guard?.enforcement === "enforced" && evidence) {
		checks.push(ready("Mutation guard", guard.invocation ?? "verified hook"));
	} else if (guard?.invocation?.includes("claude-code")) {
		checks.push(
			setup(
				"Mutation guard",
				"rerun the Claude adapter to install and verify its PreToolUse hook",
			),
		);
	} else {
		checks.push(
			limitation(
				"Mutation guard",
				"this host has no verified denial hook; mutating stages stay blocked",
			),
		);
	}

	for (const tool of ["gitlab-forge", "gitlab-work-item"]) {
		checks.push(
			which(tool)
				? ready(tool, which(tool) ?? "on PATH")
				: setup(tool, `install ${tool} and add its directory to PATH`),
		);
	}
	checks.push(
		credentialPresent(env)
			? ready("GitLab credential", "present")
			: setup(
					"GitLab credential",
					"set GITLAB_TOKEN, GL_TOKEN_FILE, or ~/token",
				),
	);
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

	return {
		checks,
		coreReady: checks.every((check) => !check.required || check.ok),
	};
}

export function formatDoctorReport(report: DoctorReport): string {
	const categories: DoctorCategory[] = [
		"Ready now",
		"Needs setup",
		"Host limitation",
		"Human-owned",
	];
	const sections = categories
		.map((category) => {
			const rows = report.checks.filter((check) => check.category === category);
			if (rows.length === 0) return "";
			return [
				category.toUpperCase(),
				...rows.map(
					(check) => `${check.ok ? "✓" : "✗"} ${check.name} - ${check.detail}`,
				),
			].join("\n");
		})
		.filter(Boolean);
	return [
		"Delivery doctor",
		...sections,
		report.coreReady
			? "Core runtime is ready. Optional capabilities remain stage-specific."
			: "Core runtime is not ready. Fix the required items above.",
	].join("\n\n");
}

if (import.meta.main) {
	const factoryRoot =
		process.env.DELIVERY_FACTORY_ROOT ?? join(import.meta.dir, "..");
	const report = await runDoctor({
		factoryRoot,
		cwd: process.cwd(),
	});
	console.log(formatDoctorReport(report));
	process.exit(report.coreReady ? 0 : 1);
}
