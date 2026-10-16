export type MutationEnforcement = "enforced" | "unenforced" | "unknown";

export interface HostCapability {
	name: string;
	mutationEnforcement?: MutationEnforcement;
}

export interface StageStartResult {
	allowed: boolean;
	reason?: string;
}

export const CLAUDE_CODE_HOST: HostCapability = {
	name: "claude-code",
	mutationEnforcement: "enforced",
};

export const CURSOR_HOST: HostCapability = {
	name: "cursor",
	mutationEnforcement: "unenforced",
};

export const UNKNOWN_HOST: HostCapability = {
	name: "unknown",
	mutationEnforcement: "unknown",
};

export const HOST_DECLARATIONS: Record<string, HostCapability> = {
	"claude-code": CLAUDE_CODE_HOST,
	cursor: CURSOR_HOST,
};

export const MUTATING_STAGES = new Set([
	"draft",
	"execute",
	"address-comments",
	"archive",
	"improve-apply",
	"improve-rollback",
	"auto",
]);

export const READ_ONLY_STAGES = new Set([
	"discover",
	"triage",
	"groom",
	"review",
	"ship",
	"verify",
	"retro",
	"improve",
	"status",
	"help",
]);

export function hostFromName(name: string): HostCapability {
	return HOST_DECLARATIONS[name] ?? { name, mutationEnforcement: "unknown" };
}

export function canStartStage(input: {
	stage: string;
	host: HostCapability;
}): StageStartResult {
	if (READ_ONLY_STAGES.has(input.stage)) {
		return { allowed: true };
	}
	if (!MUTATING_STAGES.has(input.stage)) {
		return { allowed: false, reason: `Unknown stage '${input.stage}'.` };
	}
	const enforcement = input.host?.mutationEnforcement;
	if (
		enforcement !== "enforced" &&
		enforcement !== "unenforced" &&
		enforcement !== "unknown"
	) {
		return {
			allowed: false,
			reason: "Host mutation enforcement is missing.",
		};
	}
	if (enforcement !== "enforced") {
		return {
			allowed: false,
			reason: `Mutating stage '${input.stage}' cannot start on ${input.host.name} because mutation boundaries are ${enforcement}.`,
		};
	}
	return { allowed: true };
}

if (import.meta.main) {
	const stage = process.argv[2];
	const hostName = process.argv[3];
	if (!stage || !hostName) {
		console.error("usage: stage-gating.ts <stage> <host>");
		process.exit(2);
	}
	const result = canStartStage({ stage, host: hostFromName(hostName) });
	console.log(JSON.stringify(result));
	process.exit(result.allowed ? 0 : 1);
}
