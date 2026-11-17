import {
	MUTATING_STAGES,
	READ_ONLY_STAGES,
	type RuntimeManifest,
	capabilityResult,
	loadRuntimeManifest,
	requiredCapabilitiesForStage,
} from "./runtime-manifest";

export { MUTATING_STAGES, READ_ONLY_STAGES } from "./runtime-manifest";

export interface StageStartResult {
	allowed: boolean;
	reason?: string;
}

export function canStartStage(input: {
	stage: string;
	runtime: RuntimeManifest;
}): StageStartResult {
	if (READ_ONLY_STAGES.has(input.stage)) {
		return { allowed: true };
	}
	if (!MUTATING_STAGES.has(input.stage)) {
		return { allowed: false, reason: `Unknown stage '${input.stage}'.` };
	}
	for (const capability of requiredCapabilitiesForStage(input.stage)) {
		const result = capabilityResult(input.runtime, capability);
		if (!result.ok) {
			return {
				allowed: false,
				reason: result.reason,
			};
		}
	}
	return { allowed: true };
}

if (import.meta.main) {
	const stage = process.argv[2];
	const manifestPath = process.argv[3];
	if (!stage || !manifestPath) {
		console.error("usage: stage-gating.ts <stage> <runtime-manifest.json>");
		process.exit(2);
	}
	const runtime = await loadRuntimeManifest(manifestPath);
	const result = canStartStage({ stage, runtime });
	console.log(JSON.stringify(result));
	process.exit(result.allowed ? 0 : 1);
}
