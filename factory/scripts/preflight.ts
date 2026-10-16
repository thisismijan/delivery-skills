import { existsSync } from "node:fs";
import { join } from "node:path";
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

async function run(argv: string[]): Promise<{ code: number; out: string }> {
	const p = Bun.spawn(argv, { stdout: "pipe", stderr: "pipe" });
	const out =
		(await new Response(p.stdout).text()) +
		(await new Response(p.stderr).text());
	return { code: await p.exited, out: out.trim() };
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

async function runChecks(): Promise<CheckResult[]> {
	const pluginRoot =
		process.env.DELIVERY_FACTORY_ROOT ?? join(import.meta.dir, "..");
	const results: CheckResult[] = [];

	results.push({
		name: "Bun runtime",
		ok: true,
		required: true,
		detail: Bun.version,
	});

	const depsOk = existsSync(join(pluginRoot, "node_modules", "zod"));
	results.push({
		name: "Plugin deps (zod) installed",
		ok: depsOk,
		required: true,
		detail: depsOk ? "ok" : `run 'bun install' in ${pluginRoot}`,
	});

	const rem = await run(["git", "remote", "-v"]);
	results.push({
		name: "git remote present",
		ok: rem.code === 0 && rem.out.length > 0,
		required: false,
		detail: redactRemote(rem.out.split("\n")[0] || "no git remote configured"),
	});

	return results;
}

if (import.meta.main) {
	const results = await runChecks();
	const { allRequiredPassed, lines } = summarize(results);
	console.log(
		"delivery-skills preflight (run this from inside the target repo)\n",
	);
	console.log(lines.join("\n"));
	console.log(
		`\n${allRequiredPassed ? "READY — all required checks passed." : "NOT READY — fix the ✗ items above."}`,
	);
	process.exit(allRequiredPassed ? 0 : 1);
}
