import { afterEach, describe, expect, test } from "bun:test";
import {
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	EXPLORER_CONTEXT_INVOCATION,
	EXPLORER_HEAD_INVOCATION,
	REPOSITORY_HEAD_LABEL,
	currentHead,
	explorerContext,
	recordedHead,
} from "./explorer-context";

const dirs: string[] = [];
afterEach(() => {
	for (const dir of dirs.splice(0))
		rmSync(dir, { recursive: true, force: true });
});

function git(cwd: string, ...args: string[]): string {
	const proc = Bun.spawnSync(["git", ...args], {
		cwd,
		stdout: "pipe",
		stderr: "pipe",
		env: {
			...process.env,
			GIT_AUTHOR_NAME: "t",
			GIT_AUTHOR_EMAIL: "t@example.invalid",
			GIT_COMMITTER_NAME: "t",
			GIT_COMMITTER_EMAIL: "t@example.invalid",
		},
	});
	if (proc.exitCode !== 0) throw new Error(proc.stderr.toString());
	return proc.stdout.toString().trim();
}

function repo(): string {
	const root = mkdtempSync(join(tmpdir(), "explorer-context-"));
	dirs.push(root);
	git(root, "init", "--quiet", "-b", "main");
	git(root, "config", "commit.gpgsign", "false");
	writeFileSync(join(root, "a.ts"), "a\n");
	git(root, "add", ".");
	git(root, "commit", "--quiet", "-m", "base");
	return root;
}

function groom(
	root: string,
	folder: string,
	title: string,
	report?: string,
): string {
	const dir = join(root, ".delivery", "grooming", folder);
	mkdirSync(dir, { recursive: true });
	writeFileSync(join(dir, "01-ticket.md"), `# ${title}\n\n## Context\n\nx\n`);
	writeFileSync(join(dir, "decisions.md"), `# ${title}\n`);
	if (report !== undefined)
		writeFileSync(join(dir, "explorer-report.md"), report);
	return dir;
}

const report = (head: string) =>
	`## Session 1\n${REPOSITORY_HEAD_LABEL} ${head}\n\n# Exploration\n- a.ts\n`;

describe("recordedHead", () => {
	test("reads the head the latest session recorded", () => {
		const a = "a".repeat(40);
		const b = "b".repeat(40);
		expect(
			recordedHead(
				`${report(a)}\n## Session 2\n${REPOSITORY_HEAD_LABEL} \`${b}\`\n`,
			),
		).toBe(b);
	});

	test("a latest session with no head has none, even if an earlier one did", () => {
		expect(
			recordedHead(`${report("a".repeat(40))}\n## Session 2\nno head\n`),
		).toBeUndefined();
	});
});

describe("explorerContext", () => {
	test("no matching draft means no report", () => {
		const root = repo();
		groom(root, "other", "Another ticket", report(currentHead(root)));
		expect(explorerContext(root, "Wanted ticket")).toMatchObject({
			found: false,
			stale: false,
		});
	});

	test("a report written at the current head is fresh", () => {
		const root = repo();
		const dir = groom(root, "plan", "Wanted ticket", report(currentHead(root)));
		expect(explorerContext(root, "Wanted ticket")).toEqual({
			found: true,
			reportPath: join(dir, "explorer-report.md"),
			recordedHead: currentHead(root),
			stale: false,
			changedSince: [],
			reason: "The report was written at the current head.",
		});
	});

	test("files changed since the report make it stale and are named", () => {
		const root = repo();
		groom(root, "plan", "Wanted ticket", report(currentHead(root)));
		writeFileSync(join(root, "b.ts"), "b\n");
		git(root, "add", "b.ts");
		git(root, "commit", "--quiet", "-m", "later");
		expect(explorerContext(root, "Wanted ticket")).toMatchObject({
			found: true,
			stale: true,
			changedSince: ["b.ts"],
		});
	});

	test("a report with no recorded head, or a head not in history, is stale", () => {
		const root = repo();
		groom(root, "plan", "Wanted ticket", "## Session 1\n\n# Exploration\n");
		expect(explorerContext(root, "Wanted ticket")).toMatchObject({
			found: true,
			stale: true,
			changedSince: [],
		});
		groom(root, "plan", "Wanted ticket", report("c".repeat(40)));
		expect(explorerContext(root, "Wanted ticket")).toMatchObject({
			found: true,
			stale: true,
			changedSince: [],
		});
	});

	test("two grooming folders with the same title are not guessed between", () => {
		const root = repo();
		groom(root, "one", "Wanted ticket", report(currentHead(root)));
		groom(root, "two", "Wanted ticket", report(currentHead(root)));
		expect(explorerContext(root, "Wanted ticket")).toMatchObject({
			found: false,
		});
	});
});

test("the commands print the head and the context for a work item", () => {
	const root = repo();
	groom(root, "plan", "Wanted ticket", report(currentHead(root)));
	const item = join(root, "work-item.json");
	writeFileSync(item, JSON.stringify({ title: "Wanted ticket" }));
	const run = (...args: string[]) =>
		Bun.spawnSync(
			["bun", join(import.meta.dir, "explorer-context.ts"), ...args],
			{
				stdout: "pipe",
				stderr: "pipe",
				env: process.env,
			},
		);
	expect(run("head", root).stdout.toString().trim()).toBe(currentHead(root));
	expect(JSON.parse(run("find", root, item).stdout.toString())).toMatchObject({
		found: true,
		stale: false,
	});
	writeFileSync(item, JSON.stringify({}));
	expect(run("find", root, item).exitCode).toBe(1);
});

test("groom stamps the head, draft passes the report to feasibility only", () => {
	const root = join(import.meta.dir, "..", "..");
	const read = (path: string) =>
		readFileSync(join(root, path), "utf8").replace(
			/"\$\{FACTORY_ROOT\}\/([^"]+)"/g,
			"$1",
		);
	const groomSkill = read("skills/groom/SKILL.md");
	expect(groomSkill).toContain(
		`followed by the line \`${REPOSITORY_HEAD_LABEL} <sha>\``,
	);
	expect(groomSkill).toContain(
		EXPLORER_HEAD_INVOCATION.replace("<repoRoot>", '"<repoRoot>"'),
	);
	const draft = read("skills/draft/SKILL.md");
	expect(draft).toContain(
		EXPLORER_CONTEXT_INVOCATION.replace(
			"<repoRoot> <work-item.json>",
			'"<repoRoot>" "<reviewDir>/work-item.json"',
		),
	);
	expect(draft.replace(/\s+/g, " ")).toContain(
		"Never give the report to the explain-back reader or the readiness reviewer.",
	);
	const analyst = read("factory/agents/feasibility-analyst.md").replace(
		/\s+/g,
		" ",
	);
	expect(analyst).toContain("Re-explore every file `changedSince` lists");
	expect(analyst).toContain("The report never replaces evidence in the code");
});
