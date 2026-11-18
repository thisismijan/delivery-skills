import { afterEach, expect, test } from "bun:test";
import {
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { scanDiff } from "./diff-scan";
import { zoneMapDoctorCheck } from "./doctor";
import { REVIEW_LENSES, planReviewFanout } from "./review-fanout";
import {
	RISK_ZONES_CHECK_INVOCATION,
	RISK_ZONES_DIFF_INVOCATION,
	checkChangeZones,
	checkDiffZones,
	redZoneApproved,
	workerRunLedger,
} from "./risk-zones";
import {
	ZONES_PATH,
	inZone,
	parseZones,
	zoneHits,
	zonesRoot,
} from "./zone-map";

const roots: string[] = [];
afterEach(() => {
	for (const root of roots.splice(0))
		rmSync(root, { recursive: true, force: true });
});

function git(cwd: string, ...args: string[]) {
	const run = Bun.spawnSync(
		[
			"git",
			"-c",
			"user.name=t",
			"-c",
			"user.email=t@example.test",
			"-c",
			"commit.gpgsign=false",
			...args,
		],
		{
			cwd,
			stdout: "pipe",
			stderr: "pipe",
		},
	);
	if (run.exitCode !== 0) throw new Error(run.stderr.toString());
	return run.stdout.toString();
}

function write(root: string, path: string, text: string) {
	mkdirSync(dirname(join(root, path)), { recursive: true });
	writeFileSync(join(root, path), text);
}

function repo(zones?: string) {
	const root = mkdtempSync(join(tmpdir(), "risk-zones-"));
	roots.push(root);
	git(root, "init", "-q", "-b", "main");
	write(root, "src/billing/rules.ts", "export const fee = 1;\n");
	write(root, "src/ui/button.ts", "export const b = 1;\n");
	write(root, "legacy/old.ts", "export const o = 1;\n");
	git(root, "add", ".");
	git(root, "commit", "-q", "-m", "init");
	if (zones !== undefined) write(root, ".delivery/zones", zones);
	return root;
}

function change(root: string, name: string, impact: string[]) {
	const dir = join(root, "openspec/changes", name);
	write(
		root,
		`openspec/changes/${name}/proposal.md`,
		`## Why\n\nx\n\n## Impact\n\n${impact.map((path) => `\`${path}\``).join(", ")}\n`,
	);
	return dir;
}

const MAP = "# owner-drawn\nred src/billing\nyellow legacy/**/*.ts\n";

test("the map reads red and yellow zones and refuses anything else", () => {
	expect(parseZones(MAP)).toEqual([
		{ level: "red", pattern: "src/billing" },
		{ level: "yellow", pattern: "legacy/**/*.ts" },
	]);
	expect(() => parseZones("orange src\n")).toThrow("line 1");
	expect(() => parseZones("red /etc\n")).toThrow();
	expect(() => parseZones("red ../outside\n")).toThrow();
	expect(() => parseZones("red a b\n")).toThrow();
});

test("a plain path covers itself and everything below it; red wins over yellow", () => {
	expect(inZone("src/billing/rules.ts", "src/billing/")).toBe(true);
	expect(inZone("src/billing-ui/x.ts", "src/billing")).toBe(false);
	expect(inZone("legacy/a/b.ts", "legacy/**/*.ts")).toBe(true);
	expect(
		zoneHits(
			["src/billing/rules.ts", "legacy/x.ts"],
			parseZones(`${MAP}yellow src\n`),
		),
	).toEqual({
		red: [{ path: "src/billing/rules.ts", pattern: "src/billing" }],
		yellow: [{ path: "legacy/x.ts", pattern: "legacy/**/*.ts" }],
	});
});

const DIFF = [
	"diff --git a/src/billing/rules.ts b/src/billing/rules.ts",
	"--- a/src/billing/rules.ts",
	"+++ b/src/billing/rules.ts",
	"@@ -1 +1 @@",
	"-export const fee = 1;",
	"+export const fee = 2;",
	"",
].join("\n");

test("with no map the scan output is unchanged; with one it adds zones", () => {
	const plain = scanDiff(DIFF);
	expect("zones" in plain).toBe(false);
	expect(scanDiff(DIFF, null)).toEqual(plain);
	expect(scanDiff(DIFF, parseZones(MAP))).toEqual({
		...plain,
		zones: {
			red: [{ path: "src/billing/rules.ts", pattern: "src/billing" }],
			yellow: [],
		},
	});
});

test("a red zone runs every review lens at any level", () => {
	const small = {
		changedFiles: 1,
		changedLines: 2,
		reversible: true,
		classificationComplete: true,
		surfaces: [],
	};
	expect(planReviewFanout(small).mode).toBe("small");
	for (const breadth of ["measured", "size-trimmed"] as const) {
		expect(
			planReviewFanout(
				{ ...small, redZones: ["src/billing/rules.ts"] },
				breadth,
			),
		).toEqual({
			mode: "full",
			lenses: [...REVIEW_LENSES],
			reason: "red zone: src/billing/rules.ts",
		});
	}
});

test("with no map the execute check passes and reports nothing", async () => {
	const root = repo();
	const dir = change(root, "fee-change", ["src/billing/rules.ts"]);
	expect(
		await checkChangeZones({ repoRoot: root, changeDir: dir }),
	).toMatchObject({
		map: false,
		needsApproval: false,
		red: [],
	});
});

test("a plan reaching a red zone needs a person's recorded approval", async () => {
	const root = repo(MAP);
	const dir = change(root, "fee-change", []);
	write(
		root,
		"openspec/changes/fee-change/.delivery.json",
		JSON.stringify({
			workItemKey: "WORK-1",
			complexitySignal: "low",
			affectedAreas: ["src"],
		}),
	);
	const result = await checkChangeZones({ repoRoot: root, changeDir: dir });
	expect(result).toMatchObject({
		map: true,
		needsApproval: true,
		approved: false,
	});
	expect(result.red).toContainEqual({
		path: "src/billing/rules.ts",
		pattern: "src/billing",
	});
	const ledger = join(root, ".delivery/runs/run-1.md");
	write(
		root,
		".delivery/runs/run-1.md",
		'# Run\n\n## Approvals\n\n- 2026-11-16T22:00:00Z red-zone fee-change-other — x — operator — "yes"\n',
	);
	expect(
		(await checkChangeZones({ repoRoot: root, changeDir: dir, ledger }))
			.needsApproval,
	).toBe(true);
	write(
		root,
		".delivery/runs/run-1.md",
		'# Run\n\n## Approvals\n\n- 2026-11-16T22:00:00Z red-zone fee-change — build in src/billing — operator — "go ahead"\n\n## Stops\n',
	);
	expect(
		await checkChangeZones({ repoRoot: root, changeDir: dir, ledger }),
	).toMatchObject({
		needsApproval: false,
		approved: true,
	});
});

test("yellow zones are reported only, and a plan naming no paths fails closed", async () => {
	const root = repo(MAP);
	const yellow = await checkChangeZones({
		repoRoot: root,
		changeDir: change(root, "legacy-tidy", ["legacy/old.ts", "src/ui"]),
	});
	expect(yellow).toMatchObject({ needsApproval: false, red: [] });
	expect(yellow.yellow).toEqual([
		{ path: "legacy/old.ts", pattern: "legacy/**/*.ts" },
	]);
	const unnamed = await checkChangeZones({
		repoRoot: root,
		changeDir: change(root, "vague", []),
	});
	expect(unnamed.needsApproval).toBe(true);
	expect(unnamed.reasons[0]).toContain("names no planned paths");
});

test("a worker worktree reads the main checkout's map and the run ledger beside its journal", () => {
	const root = repo(MAP);
	const worktree = join(root, "..", `${root.split("/").at(-1)}-wt`);
	roots.push(worktree);
	git(root, "worktree", "add", "-q", worktree);
	expect(zonesRoot(worktree)).toBe(zonesRoot(root));
	expect(workerRunLedger("/repo/.delivery/workers/run-7/WORK-1.md")).toBe(
		"/repo/.delivery/runs/run-7.md",
	);
	expect(workerRunLedger(undefined)).toBeNull();
	expect(redZoneApproved("## Approvals\n\n- t red-zone a.b — x\n", "aXb")).toBe(
		false,
	);
});

test("the CLI exits 3 until approved and 1 on an unreadable map", async () => {
	const root = repo(MAP);
	const dir = change(root, "fee-change", ["src/billing/rules.ts"]);
	const run = (cwd: string) =>
		Bun.spawnSync(
			[
				process.execPath,
				join(import.meta.dir, "risk-zones.ts"),
				"check",
				cwd,
				dir,
			],
			{
				stdout: "pipe",
				stderr: "pipe",
				env: { ...process.env, DELIVERY_WORKER_JOURNAL: "" },
			},
		);
	expect(run(root).exitCode).toBe(3);
	write(root, ".delivery/zones", "purple src\n");
	expect(run(root).exitCode).toBe(1);
});

test("execute, auto, code-review-max, and the reference name the zone gate", () => {
	const read = (path: string) =>
		readFileSync(join(import.meta.dir, "..", "..", path), "utf8")
			.replaceAll('"${FACTORY_ROOT}/scripts/', "scripts/")
			.replaceAll('"$FACTORY_ROOT/scripts/', "scripts/")
			.replaceAll('.ts"', ".ts");
	const execute = read("skills/execute/SKILL.md");
	expect(execute).toContain(RISK_ZONES_CHECK_INVOCATION);
	expect(execute).toMatch(
		/`continuous-delivery: yes` and invoking\s+this command do not/,
	);
	expect(read("skills/delivery/workflows/auto.md")).toContain(
		RISK_ZONES_CHECK_INVOCATION.replace("[ledger]", "<ledger>"),
	);
	expect(read("skills/code-review-max/SKILL.md")).toContain(
		"reference/risk-zones.md",
	);
	expect(read("skills/code-review-max/reference/risk-zones.md")).toMatch(
		/`zones.red` path into the\s+fan-out input as `redZones`/,
	);
	expect(read("docs/reference.md")).toContain(RISK_ZONES_CHECK_INVOCATION);
});

test("the build's diff into an unplanned red zone needs approval before the holdout review", () => {
	const root = repo(MAP);
	const dir = change(root, "ui-change", ["src/ui/button.ts"]);
	const base = Bun.spawnSync(["git", "rev-parse", "HEAD"], { cwd: root })
		.stdout.toString()
		.trim();
	git(root, "checkout", "-q", "-b", "ui-change");
	write(root, "src/billing/rules.ts", "export const fee = 3;\n");
	write(root, "openspec/changes/ui-change/tasks.md", "- [x] x\n");
	git(root, "add", ".");
	git(root, "commit", "-q", "-m", "change");
	const result = checkDiffZones({
		repoRoot: root,
		changeDir: dir,
		base,
		head: "HEAD",
	});
	expect(result).toMatchObject({
		map: true,
		needsApproval: true,
		red: [{ path: "src/billing/rules.ts", pattern: "src/billing" }],
	});
	expect(result.changed).not.toContain("openspec/changes/ui-change/tasks.md");
	write(
		root,
		".delivery/runs/r.md",
		'## Approvals\n\n- t red-zone ui-change — billing — operator — "ok"\n',
	);
	expect(
		checkDiffZones({
			repoRoot: root,
			changeDir: dir,
			base,
			head: "HEAD",
			ledger: join(root, ".delivery/runs/r.md"),
		}),
	).toMatchObject({ approved: true, needsApproval: false });
	rmSync(join(root, ".delivery/zones"));
	expect(
		checkDiffZones({ repoRoot: root, changeDir: dir, base, head: "HEAD" }),
	).toMatchObject({
		map: false,
		needsApproval: false,
	});
});

test("doctor reports a readable map, names an unreadable one, and says nothing without one", () => {
	expect(zoneMapDoctorCheck(repo())).toBeNull();
	expect(zoneMapDoctorCheck(repo(MAP))).toMatchObject({
		name: "Risk zones",
		ok: true,
		detail: `1 red and 1 yellow zones in ${ZONES_PATH}`,
	});
	expect(zoneMapDoctorCheck(repo("teal src\n"))).toMatchObject({
		ok: false,
		detail: expect.stringContaining("line 1"),
	});
});

test("execute and the reference run the diff check", () => {
	const read = (path: string) =>
		readFileSync(join(import.meta.dir, "..", "..", path), "utf8")
			.replaceAll('"${FACTORY_ROOT}/scripts/', "scripts/")
			.replaceAll('"$FACTORY_ROOT/scripts/', "scripts/")
			.replaceAll('.ts"', ".ts");
	expect(read("skills/execute/SKILL.md")).toContain(
		RISK_ZONES_DIFF_INVOCATION.replace(
			"<base> <head>",
			"<default-branch> HEAD",
		),
	);
	expect(read("docs/reference.md")).toContain(RISK_ZONES_DIFF_INVOCATION);
});
