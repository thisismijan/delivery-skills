import { existsSync } from "node:fs";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import type { RuntimeManifest } from "./runtime-manifest";
import { parseRuntimeManifest } from "./runtime-manifest";

const ADVERTISED_CAPABILITIES = [
	"forge.change",
	"review.publish",
	"tracker.item",
] as const;
type AdvertisedCapability = (typeof ADVERTISED_CAPABILITIES)[number];

const EXECUTABLES: Record<
	string,
	Partial<Record<AdvertisedCapability, string>>
> = {
	gitlab: {
		"forge.change": "gitlab-forge",
		"review.publish": "gitlab-forge",
		"tracker.item": "gitlab-work-item",
	},
	github: {
		"forge.change": "github-forge",
		"review.publish": "github-forge",
		"tracker.item": "github-tracker",
	},
	jira: {
		"tracker.item": "jira-tracker",
	},
};

interface ProviderManifest {
	name: string;
	version: number;
	kind: "forge" | "tracker" | "spec-tool";
	capabilities?: readonly string[];
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

function isAdvertisedCapability(value: string): value is AdvertisedCapability {
	return (ADVERTISED_CAPABILITIES as readonly string[]).includes(value);
}

export function advertisedProviderCapabilities(
	provider: ProviderManifest,
): AdvertisedCapability[] {
	if (provider.capabilities && provider.capabilities.length > 0) {
		return [...new Set(provider.capabilities.filter(isAdvertisedCapability))];
	}
	if (provider.kind === "forge") return ["forge.change", "review.publish"];
	if (provider.kind === "tracker") return ["tracker.item"];
	return [];
}

function unknownAdvertisedCapabilities(provider: ProviderManifest): string[] {
	if (!provider.capabilities?.length) return [];
	return [
		...new Set(
			provider.capabilities.filter((value) => !isAdvertisedCapability(value)),
		),
	];
}

export function gitlabCredentialPresent(
	env: Record<string, string | undefined>,
): boolean {
	if (env.GITLAB_TOKEN?.trim()) return true;
	if (env.GL_TOKEN_FILE && existsSync(env.GL_TOKEN_FILE)) return true;
	const home = env.HOME;
	return Boolean(home && existsSync(join(home, "token")));
}

export function githubCredentialPresent(
	env: Record<string, string | undefined>,
): boolean {
	if (env.GITHUB_TOKEN?.trim() || env.GH_TOKEN?.trim()) return true;
	if (env.GH_TOKEN_FILE && existsSync(env.GH_TOKEN_FILE)) return true;
	const home = env.HOME;
	return Boolean(home && existsSync(join(home, "token")));
}

// Settings a repository must record (delivery init --setting key=value) before a remote work-item
// provider can serve it. They are per repository because one machine serves repositories that
// file work items in different places; anything machine-wide stays in the environment.
export const REQUIRED_REPOSITORY_SETTINGS: Readonly<
	Record<string, readonly string[]>
> = {
	jira: ["project"],
};

export function jiraCredentialPresent(
	env: Record<string, string | undefined>,
): boolean {
	const email = env.JIRA_EMAIL?.trim();
	const token = env.JIRA_API_TOKEN?.trim() || env.JIRA_TOKEN?.trim();
	if (email && token) return true;
	if (env.JIRA_TOKEN_FILE && existsSync(env.JIRA_TOKEN_FILE)) return true;
	return Boolean(env.HOME && existsSync(join(env.HOME, "jira-token")));
}

function absoluteBinDir(binDir: string): string {
	return isAbsolute(binDir) ? binDir : resolve(binDir);
}

function adapterCapability(
	ready: boolean,
	invocation: string,
	provider: string,
): Record<string, unknown> {
	return ready
		? {
				available: true,
				mode: "adapter",
				invocation,
				provider,
			}
		: { available: false, mode: "unavailable" };
}

export function toolsForProvider(
	name: string,
	capabilities: readonly AdvertisedCapability[],
): string[] {
	const mapping = EXECUTABLES[name];
	if (!mapping) return [];
	return [
		...new Set(
			capabilities
				.map((capability) => mapping[capability])
				.filter((tool): tool is string => Boolean(tool)),
		),
	];
}

export function credentialState(
	name: string,
	env: Record<string, string | undefined>,
): { ready: boolean; reasons: string[] } {
	if (name === "gitlab") {
		const ready = gitlabCredentialPresent(env);
		return {
			ready,
			reasons: ready
				? []
				: ["set GITLAB_TOKEN, GL_TOKEN_FILE, or ~/token for GitLab access"],
		};
	}
	if (name === "github") {
		const ready = githubCredentialPresent(env);
		return {
			ready,
			reasons: ready
				? []
				: [
						"set GITHUB_TOKEN, GH_TOKEN, GH_TOKEN_FILE, or ~/token for GitHub access",
					],
		};
	}
	if (name === "jira") {
		const reasons: string[] = [];
		if (!env.JIRA_SITE?.trim()) {
			reasons.push("set JIRA_SITE to your Jira Cloud site URL");
		}
		// The project is per repository (delivery init --setting project=<KEY>), so installing
		// once for every repository on this machine does not depend on any one of them.
		if (!jiraCredentialPresent(env)) {
			reasons.push(
				"set JIRA_EMAIL and JIRA_API_TOKEN, or JIRA_TOKEN_FILE, or ~/jira-token for Jira access",
			);
		}
		return { ready: reasons.length === 0, reasons };
	}
	return { ready: false, reasons: [] };
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

	if (provider.name === "openspec" && provider.kind === "spec-tool") {
		const ready = which("openspec") !== null;
		return {
			name: provider.name,
			ready,
			reasons: ready ? [] : ["install the OpenSpec CLI and rerun setup"],
			runtime: unavailableRuntime(),
		};
	}

	const claimed = advertisedProviderCapabilities(provider);
	const unknown = unknownAdvertisedCapabilities(provider);
	const mapping = EXECUTABLES[provider.name];
	if (!mapping || claimed.length === 0) {
		const reasons: string[] = [];
		if (provider.version !== 1) {
			reasons.push("provider manifest version must be 1");
		}
		if (unknown.length > 0) {
			reasons.push(
				"provider capabilities must be forge.change, review.publish, or tracker.item",
			);
		}
		return {
			name: provider.name,
			ready: false,
			reasons:
				reasons.length > 0
					? reasons
					: ["provider has no portable readiness probe"],
			runtime: unavailableRuntime(),
		};
	}

	const binDir = absoluteBinDir(options.binDir);
	const reasons: string[] = [];
	if (provider.version !== 1) {
		reasons.push("provider manifest version must be 1");
	}
	if (unknown.length > 0) {
		reasons.push(
			"provider capabilities must be forge.change, review.publish, or tracker.item",
		);
	}

	const bunReady = Boolean(which("bun"));
	if (!bunReady) reasons.push("bun is not on PATH");

	const credentials = credentialState(provider.name, env);
	reasons.push(...credentials.reasons);

	const needed = [
		...new Set(
			claimed
				.map((capability) => mapping[capability])
				.filter((tool): tool is string => Boolean(tool)),
		),
	];
	for (const tool of needed) {
		if (!existsSync(join(binDir, tool))) {
			reasons.push(`${tool} is not installed in ${binDir}`);
		}
	}

	const unmapped = claimed.filter((capability) => !mapping[capability]);
	if (unmapped.length > 0) {
		reasons.push("provider has no portable readiness probe");
	}

	const commonReady =
		provider.version === 1 &&
		unknown.length === 0 &&
		unmapped.length === 0 &&
		bunReady &&
		credentials.ready;

	const capabilities = Object.fromEntries(
		claimed.map((capability) => {
			const tool = mapping[capability];
			const executable = join(binDir, tool ?? capability);
			const ready = Boolean(commonReady && tool && existsSync(executable));
			return [
				capability,
				adapterCapability(ready, `exec:${executable}`, provider.name),
			];
		}),
	);

	return {
		name: provider.name,
		ready: reasons.length === 0,
		reasons,
		runtime: parseRuntimeManifest({ version: 1, capabilities }),
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
