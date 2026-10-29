import {
	existsSync,
	mkdirSync,
	readFileSync,
	realpathSync,
	writeFileSync,
} from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { z } from "zod";
import { loadConfig } from "./config";
import type { DeliveryLevel } from "./levels";

// biome-ignore format: the workflow contract reads each invocation as one double-quoted literal
export const SANDBOX_CONFIRM_INVOCATION =
	"scripts/sandbox-run.ts confirm <repoRoot> <sandbox.json>";
// biome-ignore format: the workflow contract reads each invocation as one double-quoted literal
export const SANDBOX_CHECK_INVOCATION =
	"scripts/sandbox-run.ts check <repoRoot>";
// biome-ignore format: the workflow contract reads each invocation as one double-quoted literal
export const SANDBOX_RUN_INVOCATION =
	"scripts/sandbox-run.ts run <repoRoot> <worktree-path> <state-root> <run-id> <KEY> [--dry-run]";
// biome-ignore format: the workflow contract reads each invocation as one double-quoted literal
export const SANDBOX_STOP_INVOCATION =
	"scripts/sandbox-run.ts stop <repoRoot> <run-id> <KEY>";

export const SANDBOX_PATH = ".delivery/sandbox.json";
export const SANDBOX_ENGINES = ["docker", "podman"] as const;
export const MAX_SANDBOX_ENV = 50;
export const MAX_SANDBOX_SETUP = 20;

const FACTORY_ROOT = resolve(import.meta.dir, "..");

const RESERVED_ENV = new Set([
	"DELIVERY_STATE_ROOT",
	"DELIVERY_WORKER_JOURNAL",
	"DELIVERY_SANDBOX",
	"DELIVERY_LEVEL",
	"FACTORY_ROOT",
	"HOME",
]);

const Argv = z.array(z.string().min(1)).min(1);

export const SandboxConfig = z
	.object({
		version: z.literal(1),
		engine: z.enum(SANDBOX_ENGINES),
		image: z
			.string()
			.regex(
				/^[a-z0-9][a-z0-9._/:@-]*$/,
				"must be an image reference with no spaces or options",
			),
		network: z.enum(["none", "open"]),
		env: z
			.array(
				z
					.string()
					.regex(/^[A-Z_][A-Z0-9_]*$/, "must be an environment variable name")
					.refine(
						(name) => !RESERVED_ENV.has(name),
						"is set by the sandbox runner",
					),
			)
			.max(MAX_SANDBOX_ENV),
		setup: z.array(Argv).max(MAX_SANDBOX_SETUP),
		worker: Argv,
		approval: z
			.object({
				who: z.string().trim().min(1),
				words: z.string().trim().min(1),
				at: z.string().datetime(),
			})
			.strict(),
	})
	.strict()
	.superRefine((config, ctx) => {
		if (new Set(config.env).size !== config.env.length) {
			ctx.addIssue({
				code: "custom",
				path: ["env"],
				message: "each variable is listed once",
			});
		}
		if (!config.worker.some((arg) => arg.includes("{key}"))) {
			ctx.addIssue({
				code: "custom",
				path: ["worker"],
				message: "the worker command must name the ticket with {key}",
			});
		}
	});
export type SandboxConfig = z.infer<typeof SandboxConfig>;

const Key = z.string().regex(/^[A-Z][A-Z0-9]+-\d+$/, "is not a ticket key");
const RunId = z
	.string()
	.regex(/^[A-Za-z0-9][A-Za-z0-9-]{0,63}$/, "is not a run id");

export interface EngineRun {
	code: number;
	stdout: string;
	stderr: string;
}

export interface SandboxHost {
	which(name: string): string | null;
	engine(argv: string[]): EngineRun;
	attached(argv: string[]): Promise<number>;
	uid(): number;
	gid(): number;
}

export const realHost: SandboxHost = {
	which: (name) => Bun.which(name),
	engine(argv) {
		const proc = Bun.spawnSync(argv, { stdout: "pipe", stderr: "pipe" });
		return {
			code: proc.exitCode ?? 1,
			stdout: proc.stdout.toString(),
			stderr: proc.stderr.toString(),
		};
	},
	async attached(argv) {
		const proc = Bun.spawn(argv, {
			stdin: "ignore",
			stdout: "inherit",
			stderr: "inherit",
		});
		return await proc.exited;
	},
	uid: () => process.getuid?.() ?? 0,
	gid: () => process.getgid?.() ?? 0,
};

function git(cwd: string, args: string[]): EngineRun {
	const proc = Bun.spawnSync(["git", ...args], {
		cwd,
		stdout: "pipe",
		stderr: "pipe",
	});
	return {
		code: proc.exitCode ?? 1,
		stdout: proc.stdout.toString(),
		stderr: proc.stderr.toString(),
	};
}

export function confirmSandbox(
	repoRoot: string,
	input: unknown,
): SandboxConfig {
	const config = SandboxConfig.parse(input);
	const target = join(realpathSync(repoRoot), SANDBOX_PATH);
	mkdirSync(dirname(target), { recursive: true });
	writeFileSync(target, `${JSON.stringify(config, null, "\t")}\n`);
	return config;
}

export function loadSandbox(repoRoot: string): SandboxConfig | undefined {
	const path = join(realpathSync(repoRoot), SANDBOX_PATH);
	if (!existsSync(path)) return undefined;
	let raw: unknown;
	try {
		raw = JSON.parse(readFileSync(path, "utf8"));
	} catch {
		throw new Error(`${SANDBOX_PATH} is not valid JSON.`);
	}
	const parsed = SandboxConfig.safeParse(raw);
	if (!parsed.success) {
		throw new Error(`${SANDBOX_PATH} is malformed; confirm it again.`);
	}
	return parsed.data;
}

export type SandboxState = "ready" | "not-configured" | "unusable";

export interface SandboxCheck {
	state: SandboxState;
	reasons: string[];
	engine?: string;
	image?: string;
	network?: "none" | "open";
}

export function checkSandbox(
	repoRoot: string,
	host: SandboxHost = realHost,
): SandboxCheck {
	let config: SandboxConfig | undefined;
	try {
		config = loadSandbox(repoRoot);
	} catch (error) {
		return {
			state: "unusable",
			reasons: [error instanceof Error ? error.message : String(error)],
		};
	}
	if (!config) {
		return {
			state: "not-configured",
			reasons: [
				`No ${SANDBOX_PATH} was confirmed, so workers run in plain worktrees.`,
			],
		};
	}
	const facts = {
		engine: config.engine,
		image: config.image,
		network: config.network,
	};
	const enginePath = host.which(config.engine);
	if (!enginePath) {
		return {
			state: "unusable",
			reasons: [`${config.engine} is not on PATH.`],
			...facts,
		};
	}
	const inspect = host.engine([
		enginePath,
		"image",
		"inspect",
		"--format",
		"{{.Id}}",
		config.image,
	]);
	if (inspect.code !== 0) {
		return {
			state: "unusable",
			reasons: [
				`The image ${config.image} is not available locally; pull or build it first.`,
			],
			...facts,
		};
	}
	return {
		state: "ready",
		reasons:
			config.network === "open"
				? ["Workers run in containers with unrestricted network access."]
				: ["Workers run in containers with no network access."],
		...facts,
	};
}

export function containerName(runId: string, key: string): string {
	return `delivery-${RunId.parse(runId)}-${Key.parse(key)}`.toLowerCase();
}

export interface SandboxPlan {
	name: string;
	create: string[];
	setup: string[][];
	worker: string[];
	remove: string[];
}

function commonDir(cwd: string): string {
	const run = git(cwd, ["rev-parse", "--git-common-dir"]);
	if (run.code !== 0) throw new Error(`${cwd} is not a git checkout.`);
	return realpathSync(resolve(cwd, run.stdout.trim()));
}

export function planSandbox(options: {
	repoRoot: string;
	worktreePath: string;
	stateRoot: string;
	runId: string;
	key: string;
	config: SandboxConfig;
	enginePath: string;
	uid: number;
	gid: number;
	factoryRoot?: string;
	level?: DeliveryLevel;
}): SandboxPlan {
	const key = Key.parse(options.key);
	const name = containerName(options.runId, key);
	if (!isAbsolute(options.stateRoot)) {
		throw new Error("The state root must be an absolute path.");
	}
	const root = realpathSync(options.repoRoot);
	const worktree = realpathSync(options.worktreePath);
	if (worktree === root) {
		throw new Error("The worktree is the main checkout; refusing to mount it.");
	}
	const top = git(worktree, ["rev-parse", "--show-toplevel"]);
	if (top.code !== 0 || realpathSync(top.stdout.trim()) !== worktree) {
		throw new Error(`${options.worktreePath} is not a worktree top level.`);
	}
	const common = commonDir(worktree);
	if (common !== commonDir(root)) {
		throw new Error(
			`${options.worktreePath} is not a worktree of this repository.`,
		);
	}
	const stateRoot = realpathSync(options.stateRoot);
	const workers = join(stateRoot, "workers", options.runId);
	mkdirSync(workers, { recursive: true });
	const journal = join(workers, `${key}.md`);
	const factoryRoot = realpathSync(options.factoryRoot ?? FACTORY_ROOT);
	const engine = options.enginePath;
	const create = [
		engine,
		"run",
		"--detach",
		"--name",
		name,
		"--label",
		`delivery.run=${options.runId}`,
		"--label",
		`delivery.key=${key}`,
		...(options.config.network === "none" ? ["--network", "none"] : []),
		"--cap-drop",
		"ALL",
		"--security-opt",
		"no-new-privileges",
		"--user",
		`${options.uid}:${options.gid}`,
		...(options.config.engine === "podman" ? ["--userns", "keep-id"] : []),
		"--workdir",
		worktree,
		"--volume",
		`${worktree}:${worktree}:rw`,
		"--volume",
		`${common}:${common}:rw`,
		"--volume",
		`${stateRoot}:${stateRoot}:ro`,
		"--volume",
		`${workers}:${workers}:rw`,
		"--volume",
		`${factoryRoot}:${factoryRoot}:ro`,
		"--env",
		"HOME=/tmp",
		"--env",
		"DELIVERY_SANDBOX=1",
		"--env",
		`FACTORY_ROOT=${factoryRoot}`,
		"--env",
		`DELIVERY_STATE_ROOT=${stateRoot}`,
		"--env",
		`DELIVERY_WORKER_JOURNAL=${journal}`,
		...(options.level ? ["--env", `DELIVERY_LEVEL=${options.level}`] : []),
		...options.config.env.flatMap((variable) => ["--env", variable]),
		"--entrypoint",
		"sleep",
		options.config.image,
		"infinity",
	];
	const exec = (argv: string[]) => [
		engine,
		"exec",
		"--workdir",
		worktree,
		name,
		...argv,
	];
	return {
		name,
		create,
		setup: options.config.setup.map(exec),
		worker: exec(
			options.config.worker.map((arg) => arg.replaceAll("{key}", key)),
		),
		remove: [engine, "rm", "--force", name],
	};
}

export interface SandboxRunResult {
	name: string;
	exitCode: number;
	reasons: string[];
}

export async function runSandbox(
	plan: SandboxPlan,
	host: SandboxHost = realHost,
): Promise<SandboxRunResult> {
	const created = host.engine(plan.create);
	if (created.code !== 0) {
		host.engine(plan.remove);
		return {
			name: plan.name,
			exitCode: 1,
			reasons: [
				`The container did not start: ${created.stderr.trim() || "no detail"}.`,
			],
		};
	}
	try {
		for (const [index, step] of plan.setup.entries()) {
			const code = await host.attached(step);
			if (code !== 0) {
				return {
					name: plan.name,
					exitCode: 1,
					reasons: [`Setup step ${index + 1} failed with exit code ${code}.`],
				};
			}
		}
		const code = await host.attached(plan.worker);
		return {
			name: plan.name,
			exitCode: code,
			reasons: code === 0 ? [] : [`The worker exited with code ${code}.`],
		};
	} finally {
		host.engine(plan.remove);
	}
}

export function stopSandbox(
	repoRoot: string,
	runId: string,
	key: string,
	host: SandboxHost = realHost,
): { name: string; stopped: boolean } {
	const config = loadSandbox(repoRoot);
	if (!config) throw new Error(`No ${SANDBOX_PATH} was confirmed.`);
	const enginePath = host.which(config.engine);
	if (!enginePath) throw new Error(`${config.engine} is not on PATH.`);
	const name = containerName(runId, key);
	const removed = host.engine([enginePath, "rm", "--force", name]);
	return { name, stopped: removed.code === 0 };
}

if (import.meta.main) {
	const [command, ...args] = process.argv.slice(2);
	try {
		if (command === "confirm" && args[0] && args[1]) {
			const config = confirmSandbox(
				args[0],
				JSON.parse(readFileSync(args[1], "utf8")),
			);
			console.log(
				JSON.stringify(
					{
						engine: config.engine,
						image: config.image,
						network: config.network,
					},
					null,
					2,
				),
			);
		} else if (command === "check" && args[0]) {
			const result = checkSandbox(args[0]);
			console.log(JSON.stringify(result, null, 2));
			process.exit(
				result.state === "ready"
					? 0
					: result.state === "not-configured"
						? 3
						: 1,
			);
		} else if (
			command === "run" &&
			args[0] &&
			args[1] &&
			args[2] &&
			args[3] &&
			args[4]
		) {
			const [repoRoot, worktreePath, stateRoot, runId, key] = args;
			const check = checkSandbox(repoRoot);
			if (check.state !== "ready") throw new Error(check.reasons.join(" "));
			const config = loadSandbox(repoRoot) as SandboxConfig;
			const plan = planSandbox({
				repoRoot,
				worktreePath,
				stateRoot,
				runId,
				key,
				config,
				enginePath: realHost.which(config.engine) as string,
				uid: realHost.uid(),
				gid: realHost.gid(),
				level: loadConfig().level,
			});
			if (args.includes("--dry-run")) {
				console.log(JSON.stringify(plan, null, 2));
			} else {
				const result = await runSandbox(plan);
				console.log(JSON.stringify(result, null, 2));
				process.exit(result.exitCode === 0 ? 0 : 1);
			}
		} else if (command === "stop" && args[0] && args[1] && args[2]) {
			console.log(
				JSON.stringify(stopSandbox(args[0], args[1], args[2]), null, 2),
			);
		} else {
			console.error(
				`usage: ${SANDBOX_CONFIRM_INVOCATION} | ${SANDBOX_CHECK_INVOCATION} | ${SANDBOX_RUN_INVOCATION} | ${SANDBOX_STOP_INVOCATION}`,
			);
			process.exit(2);
		}
	} catch (error) {
		console.error(error instanceof Error ? error.message : String(error));
		process.exit(1);
	}
}
