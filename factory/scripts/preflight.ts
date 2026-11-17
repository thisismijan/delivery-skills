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

const PASS = "\u2713";
const BLOCK = "\u2717";
const NOTE = "\u2022";
const DETAIL_SEPARATOR = " \u2014 ";

function mark(check: CheckResult): string {
	if (check.ok) return PASS;
	return check.required ? BLOCK : NOTE;
}

// Only a failing required check makes the stage not ready; an optional one
// is reported and otherwise ignored.
export function summarize(checks: CheckResult[]): Summary {
	const lines = checks.map(
		(check) =>
			`${mark(check)} ${check.name}${check.detail ? DETAIL_SEPARATOR + check.detail : ""}`,
	);
	const blocking = checks.filter((check) => check.required && !check.ok);
	return { allRequiredPassed: blocking.length === 0, lines };
}

const CREDENTIALS_IN_URL = /(https?:\/\/)[^/@\s]+@/gi;

export function redactRemote(value: string): string {
	return value.replace(
		CREDENTIALS_IN_URL,
		(_whole, scheme: string) => `${scheme}[redacted]@`,
	);
}

export function capabilityPreflight(
	stage: string,
	runtime: RuntimeManifest,
): CheckResult[] {
	const checks: CheckResult[] = [];
	for (const id of requiredCapabilitiesForStage(stage)) {
		const found = capabilityResult(runtime, id);
		const detail = found.ok ? (found.invocation ?? "ok") : (found.reason ?? "");
		checks.push({ name: id, ok: found.ok, required: true, detail });
	}
	return checks;
}

if (import.meta.main) {
	const report = await runDoctor({
		factoryRoot:
			process.env.DELIVERY_FACTORY_ROOT ?? join(import.meta.dir, ".."),
		cwd: process.cwd(),
	});
	console.log(formatDoctorReport(report));
	process.exit(report.readOnlyReady ? 0 : 1);
}
