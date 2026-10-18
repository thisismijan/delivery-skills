import { existsSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import type { RuntimeManifest } from "./runtime-manifest";
import { parseRuntimeManifest } from "./runtime-manifest";

interface ProviderManifest {
	name: string;
	version: number;
	kind: "forge" | "tracker" | "spec-tool";
	tools: string[];
}

export interface ProviderReadiness {
	name: string;
	ready: boolean;
	reasons: string[];
	runtime: RuntimeManifest;
}

function unavailableRuntime(): RuntimeManifest {
	return parseRuntimeManifest({ version: 1, capabilities: {} });
}

function credentialPresent(env: Record<string, string | undefined>): boolean {
	if (env.GITLAB_TOKEN?.trim()) return true;
	if (env.GL_TOKEN_FILE && existsSync(env.GL_TOKEN_FILE)) return true;
	const home = env.HOME;
	return Boolean(home && existsSync(join(home, "token")));
}

export function evaluateProvider(
	provider: ProviderManifest,
	options: {
		binDir: string;
		env?: Record<string, string | undefined>;
		which?: (name: string) => string | null;
	},
): ProviderReadiness {
	const env = options.env ?? process.env;
	const which = options.which ?? ((name) => Bun.which(name));
	const reasons: string[] = [];
	if (provider.version !== 1)
		reasons.push("provider manifest version must be 1");

	if (provider.name === "gitlab" && provider.kind === "forge") {
		for (const tool of ["gl-mr", "gl-note"]) {
			if (!existsSync(join(options.binDir, tool))) {
				reasons.push(`${tool} is not installed in ${options.binDir}`);
			} else if (!which(tool)) {
				reasons.push(
					`${tool} is installed but not on PATH; add ${options.binDir} to PATH`,
				);
			}
		}
		for (const dependency of ["curl", "jq", "awk"]) {
			if (!which(dependency)) reasons.push(`${dependency} is not on PATH`);
		}
		if (!credentialPresent(env)) {
			reasons.push(
				"set GITLAB_TOKEN, GL_TOKEN_FILE, or ~/token for GitLab access",
			);
		}
		const ready = reasons.length === 0;
		return {
			name: provider.name,
			ready,
			reasons,
			runtime: parseRuntimeManifest({
				version: 1,
				capabilities: {
					"forge.change": ready
						? {
								available: true,
								mode: "adapter",
								invocation: "gl-mr",
							}
						: { available: false, mode: "unavailable" },
					"review.publish": ready
						? {
								available: true,
								mode: "adapter",
								invocation: "gl-note",
							}
						: { available: false, mode: "unavailable" },
				},
			}),
		};
	}

	if (provider.name === "jira" && provider.kind === "tracker") {
		return {
			name: provider.name,
			ready: false,
			reasons: ["configure and probe the tracker provider in the host runtime"],
			runtime: parseRuntimeManifest({
				version: 1,
				capabilities: {
					"tracker.item": { available: false, mode: "unavailable" },
				},
			}),
		};
	}

	if (provider.name === "openspec" && provider.kind === "spec-tool") {
		const ready = which("openspec") !== null;
		return {
			name: provider.name,
			ready,
			reasons: ready ? [] : ["install the OpenSpec CLI and rerun setup"],
			runtime: unavailableRuntime(),
		};
	}

	return {
		name: provider.name,
		ready: false,
		reasons: ["provider has no portable readiness probe"],
		runtime: unavailableRuntime(),
	};
}

if (import.meta.main) {
	const [command, providerPath, binDir] = process.argv.slice(2);
	if (
		(command !== "runtime" && command !== "status") ||
		!providerPath ||
		!binDir
	) {
		console.error(
			"usage: provider-contract.ts <runtime|status> <provider.json> <bin-dir>",
		);
		process.exit(2);
	}
	try {
		const provider = (await Bun.file(providerPath).json()) as ProviderManifest;
		if (provider.name !== basename(dirname(providerPath))) {
			throw new Error("provider name must match its directory");
		}
		const readiness = evaluateProvider(provider, { binDir });
		if (command === "runtime") {
			process.stdout.write(`${JSON.stringify(readiness.runtime, null, 2)}\n`);
		} else if (readiness.ready) {
			console.log(`Provider ${readiness.name}: ready`);
		} else {
			console.log(
				[
					`Provider ${readiness.name}: needs setup`,
					...readiness.reasons.map((reason) => `- ${reason}`),
				].join("\n"),
			);
		}
	} catch (error) {
		console.error(error instanceof Error ? error.message : String(error));
		process.exit(1);
	}
}
