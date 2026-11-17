import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { GROOM_ROOT } from "./groom-paths";

// biome-ignore format: the workflow contract reads each invocation as one double-quoted literal
export const EXPLORER_HEAD_INVOCATION = "scripts/explorer-context.ts head <repoRoot>";
// biome-ignore format: the workflow contract reads each invocation as one double-quoted literal
export const EXPLORER_CONTEXT_INVOCATION = "scripts/explorer-context.ts find <repoRoot> <work-item.json>";

export const REPOSITORY_HEAD_LABEL = "Repository head:";

export interface ExplorerContext {
	found: boolean;
	reportPath?: string;
	recordedHead?: string;
	stale: boolean;
	changedSince: string[];
	reason: string;
}

const SHA = /^[0-9a-f]{40}$/;

function git(repoRoot: string, args: string[]): { code: number; out: string } {
	const proc = Bun.spawnSync(["git", "-c", "core.quotepath=false", ...args], {
		cwd: repoRoot,
		stdout: "pipe",
		stderr: "pipe",
	});
	return { code: proc.exitCode ?? 1, out: proc.stdout.toString() };
}

export function currentHead(repoRoot: string): string {
	const run = git(repoRoot, ["rev-parse", "HEAD"]);
	const head = run.out.trim();
	if (run.code !== 0 || !SHA.test(head)) {
		throw new Error("The repository head could not be read.");
	}
	return head;
}

function title(markdown: string): string | undefined {
	const line = markdown.split(/\r?\n/).find((l) => /^#\s+\S/.test(l));
	return line?.replace(/^#\s+/, "").trim();
}

// The grooming folders holding a ticket draft with exactly this title.
export function groomingFoldersFor(
	repoRoot: string,
	workItemTitle: string,
): string[] {
	const root = join(repoRoot, GROOM_ROOT);
	if (!existsSync(root)) return [];
	const wanted = workItemTitle.trim();
	const matches: string[] = [];
	for (const folder of readdirSync(root, { withFileTypes: true })) {
		if (!folder.isDirectory()) continue;
		const dir = join(root, folder.name);
		const drafts = readdirSync(dir).filter(
			(name) =>
				name.endsWith(".md") &&
				!["decisions.md", "explorer-report.md", "source.md", "prd.md"].includes(
					name,
				),
		);
		if (
			drafts.some(
				(name) => title(readFileSync(join(dir, name), "utf8")) === wanted,
			)
		) {
			matches.push(dir);
		}
	}
	return matches;
}

// The head recorded by the latest explorer session, if it recorded one.
export function recordedHead(report: string): string | undefined {
	const sessions = [...report.matchAll(/^## Session \d+/gm)].map(
		(match) => match.index ?? 0,
	);
	const latest = report.slice(sessions.length > 0 ? Math.max(...sessions) : 0);
	const heads = [
		...latest.matchAll(
			new RegExp(
				`^${REPOSITORY_HEAD_LABEL}\\s*\`?([0-9a-f]{40})\`?\\s*$`,
				"gm",
			),
		),
	].map((match) => match[1] as string);
	return heads.at(-1);
}

export function explorerContext(
	repoRoot: string,
	workItemTitle: string,
): ExplorerContext {
	const folders = groomingFoldersFor(repoRoot, workItemTitle).filter((dir) =>
		existsSync(join(dir, "explorer-report.md")),
	);
	if (folders.length === 0) {
		return {
			found: false,
			stale: false,
			changedSince: [],
			reason:
				"No grooming explorer report matches this work item's title, so feasibility explores from scratch.",
		};
	}
	if (folders.length > 1) {
		return {
			found: false,
			stale: false,
			changedSince: [],
			reason: `${folders.length} grooming folders have a draft with this title, so no report is used rather than guessing.`,
		};
	}
	const reportPath = join(folders[0] as string, "explorer-report.md");
	const head = recordedHead(readFileSync(reportPath, "utf8"));
	if (!head) {
		return {
			found: true,
			reportPath,
			stale: true,
			changedSince: [],
			reason:
				"The report records no repository head, so every claim it makes must be checked before it is relied on.",
		};
	}
	const now = currentHead(repoRoot);
	if (head === now) {
		return {
			found: true,
			reportPath,
			recordedHead: head,
			stale: false,
			changedSince: [],
			reason: "The report was written at the current head.",
		};
	}
	const diff = git(repoRoot, ["diff", "--name-only", `${head}..${now}`]);
	if (diff.code !== 0) {
		return {
			found: true,
			reportPath,
			recordedHead: head,
			stale: true,
			changedSince: [],
			reason:
				"The report's head is not in this repository's history, so every claim it makes must be checked before it is relied on.",
		};
	}
	const changedSince = diff.out.split("\n").filter(Boolean);
	return {
		found: true,
		reportPath,
		recordedHead: head,
		stale: changedSince.length > 0,
		changedSince,
		reason:
			changedSince.length > 0
				? `${changedSince.length} files changed since the report; re-explore those areas.`
				: "Nothing changed since the report's head.",
	};
}

if (import.meta.main) {
	const [mode, repoRoot, workItemPath] = process.argv.slice(2);
	try {
		if (mode === "head" && repoRoot) {
			console.log(currentHead(repoRoot));
		} else if (mode === "find" && repoRoot && workItemPath) {
			const item = JSON.parse(readFileSync(workItemPath, "utf8")) as {
				title?: unknown;
			};
			if (typeof item.title !== "string" || item.title.trim() === "") {
				throw new Error("The work item has no title.");
			}
			console.log(
				JSON.stringify(explorerContext(repoRoot, item.title), null, 2),
			);
		} else {
			console.error(
				`usage: ${EXPLORER_HEAD_INVOCATION}\n       ${EXPLORER_CONTEXT_INVOCATION}`,
			);
			process.exit(2);
		}
	} catch (error) {
		console.error(error instanceof Error ? error.message : String(error));
		process.exit(1);
	}
}
