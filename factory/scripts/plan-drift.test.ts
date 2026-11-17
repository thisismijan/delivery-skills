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
import { PLAN_DRIFT_INVOCATION, impactPaths, planDrift } from "./plan-drift";
import { CONTAINED_MAX_LINES } from "./review-fanout";

const dirs: string[] = [];
afterEach(() => {
	for (const dir of dirs.splice(0))
		rmSync(dir, { recursive: true, force: true });
});

const PROPOSAL = [
	"## Why",
	"",
	"Mentions `factory/scripts/elsewhere.ts` outside Impact, which does not count.",
	"",
	"## Impact",
	"",
	"- `factory/scripts/ledger-store.ts` calls the check from `writeLedger`",
	"- `factory/scripts/fixtures/ledger-date-only.md` (new) is a fixture",
	"- `skills/delivery/workflows/` gains a note",
	"- the exported `isLedgerTime` function",
	"",
	"## Capabilities",
	"",
	"- `docs/not-impact.md`",
].join("\n");

describe("impactPaths", () => {
	test("reads only backticked paths from the Impact section, not symbols", () => {
		expect(impactPaths(PROPOSAL)).toEqual([
			"factory/scripts/ledger-store.ts",
			"factory/scripts/fixtures/ledger-date-only.md",
			"skills/delivery/workflows",
		]);
	});

	test("a proposal with no Impact section names no paths", () => {
		expect(impactPaths("## Why\n\n`a/b.ts`\n")).toEqual([]);
	});
});

function numstat(rows: Array<[number, number, string]>): string {
	return rows.map(([a, d, p]) => `${a}\t${d}\t${p}`).join("\n");
}

describe("planDrift", () => {
	const base = {
		impactPaths: impactPaths(PROPOSAL),
		affectedAreas: ["factory/scripts/config.ts"],
		complexitySignal: "medium" as const,
	};

	test("a build inside its plan reports no drift", () => {
		const result = planDrift({
			...base,
			numstat: numstat([
				[10, 2, "factory/scripts/ledger-store.ts"],
				[30, 0, "factory/scripts/ledger-store.test.ts"],
				[4, 1, "skills/delivery/workflows/auto.md"],
				[3, 0, "factory/scripts/config.ts"],
				[50, 0, "openspec/changes/x/proposal.md"],
			]),
		});
		expect(result).toMatchObject({
			plan: "present",
			unplanned: [],
			tests: ["factory/scripts/ledger-store.test.ts"],
			sizeOverrun: false,
			drift: false,
			reasons: [],
		});
	});

	test("a file the plan does not name is reported", () => {
		const result = planDrift({
			...base,
			numstat: numstat([
				[10, 2, "factory/scripts/ledger-store.ts"],
				[5, 5, "factory/scripts/forge-provider.ts"],
			]),
		});
		expect(result.unplanned).toEqual(["factory/scripts/forge-provider.ts"]);
		expect(result.drift).toBe(true);
		expect(result.reasons).toEqual([
			"factory/scripts/forge-provider.ts changed but the plan does not name it.",
		]);
	});

	test("a low-complexity build larger than the contained limits is a size overrun", () => {
		const result = planDrift({
			...base,
			complexitySignal: "low",
			numstat: numstat([
				[CONTAINED_MAX_LINES, 1, "factory/scripts/ledger-store.ts"],
			]),
		});
		expect(result.sizeOverrun).toBe(true);
		expect(result.drift).toBe(true);
		expect(
			planDrift({
				...base,
				complexitySignal: "high",
				numstat: numstat([
					[CONTAINED_MAX_LINES, 1, "factory/scripts/ledger-store.ts"],
				]),
			}).sizeOverrun,
		).toBe(false);
	});

	test("a change with no planned paths reports every file as unplanned", () => {
		const result = planDrift({
			impactPaths: [],
			affectedAreas: [],
			complexitySignal: "medium",
			numstat: numstat([[1, 1, "a/b.ts"]]),
		});
		expect(result.plan).toBe("missing");
		expect(result.unplanned).toEqual(["a/b.ts"]);
		expect(result.drift).toBe(true);
	});
});

function git(cwd: string, ...args: string[]): void {
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
}

test("the command reads the change, its recorded areas, and the diff", () => {
	const repo = mkdtempSync(join(tmpdir(), "plan-drift-"));
	dirs.push(repo);
	git(repo, "init", "--quiet", "-b", "main");
	git(repo, "config", "commit.gpgsign", "false");
	writeFileSync(join(repo, "README.md"), "x\n");
	git(repo, "add", ".");
	git(repo, "commit", "--quiet", "-m", "base");
	git(repo, "switch", "--quiet", "-c", "work");
	const changeDir = join(repo, "openspec", "changes", "work");
	mkdirSync(changeDir, { recursive: true });
	writeFileSync(
		join(changeDir, "proposal.md"),
		"## Impact\n\n- `src/planned.ts`\n",
	);
	writeFileSync(
		join(changeDir, ".delivery.json"),
		JSON.stringify({
			workItemKey: "WORK-1",
			complexitySignal: "medium",
			affectedAreas: ["src/area"],
		}),
	);
	mkdirSync(join(repo, "src", "area"), { recursive: true });
	writeFileSync(join(repo, "src", "planned.ts"), "a\n");
	writeFileSync(join(repo, "src", "area", "inside.ts"), "a\n");
	writeFileSync(join(repo, "src", "stray.ts"), "a\n");
	git(repo, "add", ".");
	git(repo, "commit", "--quiet", "-m", "work");
	const proc = Bun.spawnSync(
		["bun", join(import.meta.dir, "plan-drift.ts"), changeDir, "main", "HEAD"],
		{ cwd: repo, stdout: "pipe", stderr: "pipe", env: process.env },
	);
	expect(proc.stderr.toString()).toBe("");
	expect(proc.exitCode).toBe(0);
	expect(JSON.parse(proc.stdout.toString())).toMatchObject({
		planned: ["src/planned.ts", "src/area"],
		unplanned: ["src/stray.ts"],
		drift: true,
	});
	const missing = Bun.spawnSync(
		[
			"bun",
			join(import.meta.dir, "plan-drift.ts"),
			join(repo, "nope"),
			"main",
			"HEAD",
		],
		{ cwd: repo, stdout: "pipe", stderr: "pipe", env: process.env },
	);
	expect(missing.exitCode).toBe(1);
});

test("execute, draft, the holdout reviewer, and the reference use the drift check", () => {
	const root = join(import.meta.dir, "..", "..");
	const read = (path: string) => readFileSync(join(root, path), "utf8");
	const execute = read("skills/execute/SKILL.md");
	expect(execute).toContain(
		'scripts/plan-drift.ts" <changeDir> <default-branch> HEAD > "<reviewDir>/plan-drift.json"',
	);
	expect(execute).toContain("`plan-drift.json` from step 9");
	expect(execute.replace(/\s+/g, " ")).toContain(
		'name every unplanned file and any size overrun under "What the checks do not prove"',
	);
	expect(read("skills/draft/SKILL.md")).toContain(
		"--areas '<affectedAreas JSON array from the feasibility verdict>'",
	);
	expect(read("factory/agents/holdout-reviewer.md")).toContain(
		"plan-drift.json",
	);
	expect(
		read("docs/reference.md").replace(/"\$FACTORY_ROOT\/([^"]+)"/g, "$1"),
	).toContain(PLAN_DRIFT_INVOCATION);
});
