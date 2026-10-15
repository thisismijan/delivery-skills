import { existsSync } from "node:fs";
import { join } from "node:path";

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

async function sh(cmd: string): Promise<{ code: number; out: string }> {
	const p = Bun.spawn(["sh", "-c", cmd], { stdout: "pipe", stderr: "pipe" });
	const out =
		(await new Response(p.stdout).text()) +
		(await new Response(p.stderr).text());
	return { code: await p.exited, out: out.trim() };
}

async function runChecks(): Promise<CheckResult[]> {
	const pluginRoot =
		process.env.CLAUDE_PLUGIN_ROOT ?? join(import.meta.dir, "..");
	const cwd = process.cwd(); // the target repo
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

	const glab = await sh("glab auth status");
	results.push({
		name: "glab authenticated",
		ok: glab.code === 0,
		required: true,
		detail: glab.code === 0 ? "ok" : "install glab and run 'glab auth login'",
	});

	const osp = await sh("command -v openspec");
	results.push({
		name: "openspec installed",
		ok: osp.code === 0,
		required: true,
		detail:
			osp.code === 0 ? osp.out : "install OpenSpec (e.g. npm i -g openspec)",
	});

	const ospInit = existsSync(join(cwd, "openspec"));
	results.push({
		name: "openspec/ initialized in target repo",
		ok: ospInit,
		required: true,
		detail: ospInit ? cwd : "run 'openspec init' in the target repo",
	});

	const rem = await sh("git remote -v");
	results.push({
		name: "git remote present (GitLab)",
		ok: rem.code === 0 && rem.out.length > 0,
		required: true,
		detail: rem.out.split("\n")[0] || "no git remote configured",
	});

	const claude = await sh("command -v claude");
	if (claude.code === 0) {
		const v = await sh(`claude plugin validate "${pluginRoot}"`);
		results.push({
			name: "claude plugin validate",
			ok: v.code === 0,
			required: false,
			detail: v.code === 0 ? "passed" : "see 'claude plugin validate' output",
		});
	} else {
		results.push({
			name: "claude CLI (for plugin validate)",
			ok: false,
			required: false,
			detail: "not on PATH — skipped",
		});
	}

	results.push({
		name: "Atlassian (Jira) MCP",
		ok: true,
		required: false,
		detail:
			"OAuths inside the Claude Code session; verify the SSE URL in .mcp.json",
	});

	return results;
}

if (import.meta.main) {
	const results = await runChecks();
	const { allRequiredPassed, lines } = summarize(results);
	console.log("ig-spec preflight (run this from inside the target repo)\n");
	console.log(lines.join("\n"));
	console.log(
		`\n${allRequiredPassed ? "READY — all required checks passed." : "NOT READY — fix the ✗ items above."}`,
	);
	process.exit(allRequiredPassed ? 0 : 1);
}
