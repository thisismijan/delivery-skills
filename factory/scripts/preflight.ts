import { join } from "node:path";
import { formatDoctorReport, runDoctor } from "./doctor";
import {
	type RuntimeManifest,
	capabilityResult,
	requiredCapabilitiesForStage,
} from "./runtime-manifest";

export interface CheckResult {
	name: string;
	ok: boolean;
	required: boolean;
	detail: string;
}

export interface Summary {
	allRequiredPassed: boolean;
	lines: string[];
}

// Pure: turn check results into a printable report + the ready/not-ready verdict.
export function summarize(results: CheckResult[]): Summary {
	const lines = results.map((r) => {
		const mark = r.ok ? "✓" : r.required ? "✗" : "•";
		return `${mark} ${r.name}${r.detail ? ` — ${r.detail}` : ""}`;
	});
	const allRequiredPassed = results.every((r) => r.ok || !r.required);
	return { allRequiredPassed, lines };
}

export function redactRemote(value: string): string {
	return value.replace(/(https?:\/\/)[^/@\s]+@/gi, "$1[redacted]@");
}

export function capabilityPreflight(
	stage: string,
	runtime: RuntimeManifest,
): CheckResult[] {
	return requiredCapabilitiesForStage(stage).map((id) => {
		const result = capabilityResult(runtime, id);
		return {
			name: id,
			ok: result.ok,
			required: true,
			detail: result.ok ? (result.invocation ?? "ok") : (result.reason ?? ""),
		};
	});
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
