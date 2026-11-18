import { afterEach, describe, expect, setDefaultTimeout, test } from "bun:test";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	readdirSync,
	rmSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { withDeliveryIgnores } from "./delivery-init";
import { selectNextAction } from "./next-action";
import {
	RESUME_PACKET_BUILD_INVOCATION,
	RESUME_PACKET_WHERE_INVOCATION,
} from "./resume-packet";
import {
	type FrozenRunContract,
	freezeRunContract,
	loadConstitution,
	sha256Canonical,
} from "./sdlc-constitution";

setDefaultTimeout(60_000);

const script = join(import.meta.dir, "resume-packet.ts");
const SKILL_ROOT =
	process.env.DELIVERY_SKILL_ROOT ??
	join(import.meta.dir, "..", "..", "skills", "delivery");

const HEADINGS = [
	"## Missing pieces",
	"## Run contract",
	"## Current status",
	"## Next command",
	"## Decisions so far",
	"## Acceptance criteria",
	"## Change files",
];
const LEFT_OUT_LINE =
	"Left out on purpose: the ledger's approvals, verdicts, stops, lessons, and header fields other than its title and ids; the run contract's approval block; non-Markdown files in a change folder; and environment variables.";
const WITHHELD_NOTE =
	"Lines that may carry a secret are withheld and shown as MISSING lines. Every other line is copied as written.";
const WITHHELD = "withheld because it may carry a secret";

const SHA256 = `sha256:${"0123456789abcdef".repeat(4)}`;
const CHANGE_NAME = "ds-5-paste-safe-resume-packet-per-run";
const REPO_PATH = "skills/delivery/workflows/delivery-ledger.md";
const WORD_LIST =
	"review/ship/address/archive/verify/retro/discover/groom/draft/execute";

const bases: string[] = [];
afterEach(() => {
	for (const dir of bases.splice(0)) {
		rmSync(dir, { recursive: true, force: true });
	}
});

interface Run {
	base: string;
	repo: string;
	state: string;
	id: string;
}

function newRun(id = "ds-run-1"): Run {
	const base = mkdtempSync(join(tmpdir(), "rp-"));
	bases.push(base);
	const repo = join(base, "repo");
	mkdirSync(repo);
	Bun.spawnSync(["git", "init", "-q"], { cwd: repo });
	writeFileSync(join(repo, ".gitignore"), withDeliveryIgnores(""));
	const state = join(repo, ".delivery");
	mkdirSync(join(state, "runs"), { recursive: true });
	return { base, repo, state, id };
}

function packetPath(run: Run): string {
	return join(run.state, "packets", `${run.id}.md`);
}

function row(
	key: string,
	title: string,
	stage: string,
	mr: string,
	blockedBy: string,
	status: string,
): string {
	return `| ${key} | ${title} | ${stage} | ${mr} | ${blockedBy} | ${status} |`;
}

const KEYS_HEADER = [
	"| Key | Title | Stage | MR | Blocked by | Status |",
	"|-----|-------|-------|----|------------|--------|",
];

const CLEAN_DECISIONS = [
	`- 2026-11-09 run — planned in ${REPO_PATH} and factory/scripts/resume-packet.test.ts — scope read — none`,
	`- 2026-11-09 DS-5 — steps ${WORD_LIST} listed — order — none`,
	`- 2026-11-09 DS-5 — change ${CHANGE_NAME} drafted — spec ready — none`,
	`- 2026-11-09 run — contract frozen as ${SHA256} — approval recorded — none`,
];

interface LedgerSpec {
	title?: string;
	ids?: string;
	rows?: string[] | null;
	tableHeader?: string[];
	decisions?: string[] | null;
	headerExtra?: string[];
	trailer?: string[];
}

function ledgerText(spec: LedgerSpec = {}): string {
	const lines = [
		`# ${spec.title ?? "Ship the resume packet"}`,
		"",
		`Ids: ${spec.ids ?? "DS-5, DS-6"}`,
		...(spec.headerExtra ?? []),
		"Created: 2026-11-09",
		"Generation: 1",
		"",
	];
	if (spec.rows !== null) {
		lines.push(
			"## Keys",
			"",
			...(spec.tableHeader ?? KEYS_HEADER),
			...(spec.rows ?? [
				row(
					"DS-5",
					"Resume packet for each run",
					"execute",
					"!12",
					"DS-3",
					"[drafted]",
				),
			]),
			"",
		);
	}
	lines.push("## Verdicts", "", "| Date | MR | Kind |", "|---|---|---|", "");
	if (spec.decisions !== null) {
		lines.push("## Decisions", "", ...(spec.decisions ?? CLEAN_DECISIONS), "");
	}
	lines.push(...(spec.trailer ?? []));
	return `${lines.join("\n")}\n`;
}

function writeLedger(run: Run, spec: LedgerSpec = {}): string {
	const path = join(run.state, "runs", `${run.id}.md`);
	writeFileSync(path, ledgerText(spec));
	return path;
}

interface TicketSpec {
	key: string;
	title: string;
	acceptance: string[];
	blockedBy: string[];
}

const DEFAULT_TICKETS: TicketSpec[] = [
	{
		key: "DS-5",
		title: "Paste-safe resume packet per run",
		acceptance: [
			"Given a run with a ledger, when the packet is built, then it names the next command",
			"Given a missing piece, when the packet is built, then the packet names it",
		],
		blockedBy: ["DS-3"],
	},
];

function contractDraft(run: Run, overrides: Record<string, unknown> = {}) {
	const live = loadConstitution();
	return {
		version: 1,
		runId: run.id,
		planVersion: 1,
		goal: "Give every run one file that a new session can continue from",
		scope: ["Build the resume packet", "Name the packet in status"],
		nonGoals: ["Resume a run automatically"],
		tickets: DEFAULT_TICKETS,
		permittedWrites: [...(live.document.stages.draft?.writes ?? [])],
		humanOwned: [...live.document.humanOwned],
		approval: {
			who: "operator",
			words: "yes, build that",
			at: "2026-11-09T00:00:00.000Z",
		},
		...overrides,
	};
}

function writeContract(
	run: Run,
	overrides: Record<string, unknown> = {},
	mutate: (frozen: FrozenRunContract) => unknown = (frozen) => frozen,
): FrozenRunContract {
	const frozen = freezeRunContract(
		contractDraft(run, overrides),
		loadConstitution().hash,
	);
	writeFileSync(
		join(run.state, "runs", `${run.id}.run-contract.json`),
		JSON.stringify(mutate(frozen)),
	);
	return frozen;
}

function writeOutdatedContract(run: Run, retiredAction: string): void {
	const current = freezeRunContract(
		contractDraft(run),
		loadConstitution().hash,
	);
	const { contractHash: _hash, ...body } = current;
	const old = {
		...body,
		humanOwned: [...body.humanOwned, retiredAction],
		constitutionHash: `sha256:${"0".repeat(64)}`,
	};
	writeFileSync(
		join(run.state, "runs", `${run.id}.run-contract.json`),
		JSON.stringify({ ...old, contractHash: sha256Canonical(old) }),
	);
}

function writeChange(
	root: string,
	folder: string,
	files: Record<string, string>,
): string {
	const dir = join(root, "openspec", "changes", folder);
	for (const [name, body] of Object.entries(files)) {
		mkdirSync(join(dir, name, ".."), { recursive: true });
		writeFileSync(join(dir, name), body);
	}
	return dir;
}

const CHANGE_FILES: Record<string, string> = {
	"proposal.md": [
		"## Why",
		"",
		`The ledger spreads state; see ${REPO_PATH} for the layout.`,
		"",
		`Change ${CHANGE_NAME} keeps hash ${SHA256} recorded.`,
	].join("\n"),
	"design.md": ["## Context", "", `Steps: ${WORD_LIST}.`].join("\n"),
	"specs/run-resume-packet/spec.md": [
		"### Requirement: one packet per run",
		"",
		"The packet holds everything a new session needs.",
	].join("\n"),
};

function completeRun(id = "ds-run-1") {
	const run = newRun(id);
	const frozen = writeContract(run);
	writeLedger(run);
	writeChange(run.repo, CHANGE_NAME, CHANGE_FILES);
	return { run, frozen };
}

function cleanEnv(
	extra: Record<string, string> = {},
): Record<string, string | undefined> {
	const {
		DELIVERY_STATE_ROOT: _stateRoot,
		DELIVERY_WORKER_JOURNAL: _journal,
		...rest
	} = process.env;
	return { ...rest, ...extra };
}

function cli(args: string[], extraEnv: Record<string, string> = {}) {
	const proc = Bun.spawnSync(["bun", script, ...args], {
		env: cleanEnv(extraEnv),
		stdout: "pipe",
		stderr: "pipe",
	});
	const stdout = proc.stdout.toString();
	const stderr = proc.stderr.toString();
	return { code: proc.exitCode, stdout, stderr, output: `${stdout}${stderr}` };
}

interface BuildResult {
	path: string;
	missing: string[];
	packet: string;
}

function build(
	run: Run,
	extraEnv: Record<string, string> = {},
	runId = run.id,
): BuildResult {
	const result = cli(["build", run.repo, runId], extraEnv);
	if (result.code !== 0) {
		throw new Error(`build exited ${result.code}: ${result.output}`);
	}
	const lines = result.stdout.trim().split("\n");
	expect(lines).toHaveLength(1);
	const parsed = JSON.parse(lines[0] as string) as {
		path: string;
		missing: string[];
	};
	expect(Object.keys(parsed).sort()).toEqual(["missing", "path"]);
	return { ...parsed, packet: readFileSync(parsed.path, "utf8") };
}

interface ScannedLine {
	line: string;
	fenced: boolean;
}

function scan(text: string): ScannedLine[] {
	let open = 0;
	return text.split("\n").map((line) => {
		if (open === 0) {
			const opening = line.match(/^(`{3,})/);
			if (opening) {
				open = (opening[1] as string).length;
				return { line, fenced: true };
			}
			return { line, fenced: false };
		}
		const closing = line.match(/^(`+)\s*$/);
		if (closing && (closing[1] as string).length >= open) open = 0;
		return { line, fenced: true };
	});
}

function headingsOf(packet: string): string[] {
	return scan(packet)
		.filter((entry) => !entry.fenced && /^## /.test(entry.line))
		.map((entry) => entry.line);
}

function sectionOf(packet: string, heading: string): string {
	const lines = scan(packet);
	const start = lines.findIndex(
		(entry) => !entry.fenced && entry.line === heading,
	);
	if (start < 0) throw new Error(`missing heading ${heading}`);
	const body: string[] = [];
	for (const entry of lines.slice(start + 1)) {
		if (!entry.fenced && /^## /.test(entry.line)) break;
		body.push(entry.line);
	}
	return body.join("\n");
}

function missingLines(text: string): string[] {
	return text.split("\n").filter((line) => line.startsWith("MISSING: "));
}

function blockFor(text: string, key: string, orderedKeys: string[]): string {
	const start = text.indexOf(key);
	if (start < 0) throw new Error(`no block for ${key}`);
	const later = orderedKeys.slice(orderedKeys.indexOf(key) + 1);
	const ends = later
		.map((next) => text.indexOf(next, start + key.length))
		.filter((index) => index >= 0);
	return text.slice(start, ends.length > 0 ? Math.min(...ends) : undefined);
}

function snapshot(dir: string): Map<string, string> {
	const files = new Map<string, string>();
	const walk = (current: string) => {
		for (const name of readdirSync(current)) {
			if (name === ".git") continue;
			const path = join(current, name);
			if (statSync(path).isDirectory()) walk(path);
			else files.set(relative(dir, path), readFileSync(path, "utf8"));
		}
	};
	walk(dir);
	return files;
}

function changedPaths(
	before: Map<string, string>,
	after: Map<string, string>,
): string[] {
	const paths = new Set([...before.keys(), ...after.keys()]);
	return [...paths].filter((p) => before.get(p) !== after.get(p)).sort();
}

function expectedNext(key: string, status: string) {
	const entry = key.startsWith("discover-") ? "DISCOVER-0" : key;
	return selectNextAction({ args: entry, status });
}

describe("exported invocations", () => {
	test("the build and where invocations are the documented single literals", () => {
		expect(RESUME_PACKET_BUILD_INVOCATION).toBe(
			"scripts/resume-packet.ts build <repo-root> <run-id>",
		);
		expect(RESUME_PACKET_WHERE_INVOCATION).toBe(
			"scripts/resume-packet.ts where <repo-root> <run-id>",
		);
		const source = readFileSync(script, "utf8");
		for (const [name, value] of [
			["RESUME_PACKET_BUILD_INVOCATION", RESUME_PACKET_BUILD_INVOCATION],
			["RESUME_PACKET_WHERE_INVOCATION", RESUME_PACKET_WHERE_INVOCATION],
		]) {
			const match = source.match(
				new RegExp(`export const ${name} = "([^"]+)"`),
			);
			expect(match?.[1]).toBe(value as string);
		}
	});
});

describe("a complete run gives a complete packet", () => {
	test("the packet holds every piece under the fixed headings and keeps ordinary paths, names and hashes", () => {
		const { run, frozen } = completeRun();
		const before = snapshot(run.base);
		const result = build(run);
		const { packet } = result;

		expect(result.path.endsWith(join("packets", `${run.id}.md`))).toBe(true);
		expect(result.missing).toEqual([]);
		expect(packet.split("\n")[0]).toBe(
			"# Resume packet: Ship the resume packet",
		);
		expect(packet).toContain(`- Run id: ${run.id}`);
		expect(packet.split("\n")).toContain("- Known by: DS-5, DS-6");
		expect(packet).not.toMatch(/^Ids:/m);
		expect(headingsOf(packet)).toEqual(HEADINGS);
		expect(sectionOf(packet, "## Missing pieces").trim()).toBe("None.");
		expect(packet).not.toContain("MISSING:");

		const contract = sectionOf(packet, "## Run contract");
		for (const text of [
			frozen.goal,
			...frozen.scope,
			...frozen.nonGoals,
			frozen.contractHash,
			frozen.constitutionHash,
			"DS-5",
			"Paste-safe resume packet per run",
			"DS-3",
			"standard",
			...frozen.permittedWrites,
			...frozen.humanOwned,
		]) {
			expect(contract).toContain(text);
		}

		const status = sectionOf(packet, "## Current status");
		for (const text of [
			"DS-5",
			"Resume packet for each run",
			"execute",
			"!12",
			"DS-3",
			"[drafted]",
		]) {
			expect(status).toContain(text);
		}

		const decisions = sectionOf(packet, "## Decisions so far");
		for (const line of CLEAN_DECISIONS) expect(decisions).toContain(line);

		const acceptance = sectionOf(packet, "## Acceptance criteria");
		expect(acceptance).toContain("DS-5");
		for (const criterion of DEFAULT_TICKETS[0]?.acceptance ?? []) {
			expect(acceptance).toContain(criterion);
		}

		const files = sectionOf(packet, "## Change files");
		expect(files).toContain(`openspec/changes/${CHANGE_NAME}`);
		for (const [name, body] of Object.entries(CHANGE_FILES)) {
			expect(files).toContain(`### ${name}`);
			for (const line of body.split("\n").filter(Boolean)) {
				expect(files).toContain(line);
			}
		}
		const order = [
			"design.md",
			"proposal.md",
			"specs/run-resume-packet/spec.md",
		];
		const positions = order.map((name) => files.indexOf(`### ${name}`));
		expect([...positions].sort((a, b) => a - b)).toEqual(positions);

		const after = snapshot(run.base);
		expect(changedPaths(before, after)).toEqual([
			relative(run.base, packetPath(run)),
		]);
	});

	test("the packet path is ignored by git, because it sits in the ignored state folder", () => {
		const { run } = completeRun();
		const result = build(run);
		const check = Bun.spawnSync(
			["git", "check-ignore", "-q", relative(run.repo, result.path)],
			{
				cwd: run.repo,
			},
		);
		expect(check.exitCode).toBe(0);
	});

	test("building again after the status changes replaces the file at the same path", () => {
		const { run } = completeRun();
		const first = build(run);
		expect(first.packet).toContain("[drafted]");
		writeLedger(run, {
			rows: [
				row(
					"DS-5",
					"Resume packet for each run",
					"review",
					"!12",
					"DS-3",
					"[ready !12]",
				),
			],
		});
		const second = build(run);
		expect(second.path).toBe(first.path);
		expect(second.packet).toContain("[ready !12]");
		expect(second.packet).not.toContain("[drafted]");
		expect(readFileSync(first.path, "utf8")).toBe(second.packet);
	});

	test("the state root override moves both the reads and the packet", () => {
		const run = newRun();
		const override = join(run.base, "shared-state");
		mkdirSync(join(override, "runs"), { recursive: true });
		const draft = contractDraft(run);
		writeFileSync(
			join(override, "runs", `${run.id}.run-contract.json`),
			JSON.stringify(freezeRunContract(draft, loadConstitution().hash)),
		);
		writeFileSync(join(override, "runs", `${run.id}.md`), ledgerText());
		const result = build(run, { DELIVERY_STATE_ROOT: override });
		expect(result.path).toBe(join(override, "packets", `${run.id}.md`));
		expect(existsSync(join(run.repo, ".delivery", "packets"))).toBe(false);
		expect(result.packet).toContain("[drafted]");
	});

	test("a plan version above one carries its supersedes hash, reason and invariant, and a level shows", () => {
		const run = newRun();
		const superseded = `sha256:${"ab".repeat(32)}`;
		writeContract(run, {
			planVersion: 2,
			supersedesHash: superseded,
			reason: "Scope grew to cover discovery runs",
			affectedInvariant: "durable-resume",
			level: "max",
		});
		writeLedger(run);
		const contract = sectionOf(build(run).packet, "## Run contract");
		expect(contract).toContain(superseded);
		expect(contract).toContain("Scope grew to cover discovery runs");
		expect(contract).toContain("durable-resume");
		expect(contract).toMatch(/level[^\n]*max/i);
	});

	test("a change file that holds a code fence cannot end the packet's fence", () => {
		const run = newRun();
		writeContract(run);
		writeLedger(run);
		const body = [
			"Example:",
			"```ts",
			"const one = 1;",
			"```",
			"## Injected heading",
			"after the fence",
		].join("\n");
		writeChange(run.repo, CHANGE_NAME, { "proposal.md": body });
		const { packet, missing } = build(run);
		expect(missing).toEqual([]);
		expect(headingsOf(packet)).toEqual(HEADINGS);
		expect(packet).toContain(body);
	});
});

describe("the next command comes from the existing selector", () => {
	const statuses: Array<[string, string]> = [
		["DS-21", "[drafted]"],
		["DS-22", "[groomed]"],
		["DS-23", "[triage: wont-fix]"],
		["DS-24", "[executing]"],
		["DS-25", "[no-go !4]"],
		["DS-26", "[ready !4]"],
		["DS-27", "[reviewed-blocked !4]"],
		["DS-28", "[merged !4]"],
		["DS-29", "[waiting: pipeline]"],
	];

	test("every ticket key reads what the selector answers for its recorded status", () => {
		const run = newRun();
		const keys = statuses.map(([key]) => key);
		writeContract(run, {
			tickets: keys.map((key) => ({
				key,
				title: `Ticket ${key}`,
				acceptance: ["It works"],
				blockedBy: [],
			})),
		});
		writeLedger(run, {
			rows: statuses.map(([key, status]) =>
				row(key, `Ticket ${key}`, "execute", "-", "-", status),
			),
			decisions: [],
		});
		for (const key of keys) {
			writeChange(run.repo, `${key.toLowerCase()}-change`, {
				"proposal.md": `Change for ${key}`,
			});
		}
		const { packet, missing } = build(run);
		expect(missing).toEqual([]);
		const next = sectionOf(packet, "## Next command");
		for (const [key, status] of statuses) {
			const block = blockFor(next, key, keys);
			const action = expectedNext(key, status);
			if (action.kind === "run") {
				expect(block).toContain(`/delivery ${key}`);
				expect(block).toContain(`next step: ${action.verb}`);
			} else {
				expect(block).toContain(`no command to type yet: ${action.reason}`);
				expect(block).not.toMatch(new RegExp(`/delivery ${key}\\b`));
			}
		}
		expect(expectedNext("DS-21", "[drafted]")).toMatchObject({
			kind: "run",
			verb: "execute",
		});
		expect(expectedNext("DS-22", "[groomed]").kind).toBe("stop");
	});

	test("a discovery key is read through the stand-in entry and has no change folder", () => {
		const run = newRun();
		const discover = [
			["discover-2026-11-09-alpha", "[discovering]"],
			["discover-2026-11-09-beta", "[discovered]"],
			["discover-2026-11-09-gamma", "[stopped: operator stopped]"],
		] as const;
		const keys = ["DS-5", "DS-6", "DS-7", ...discover.map(([key]) => key)];
		writeContract(run, {
			tickets: ["DS-5", "DS-6", "DS-7"].map((key) => ({
				key,
				title: `Ticket ${key}`,
				acceptance: ["It works"],
				blockedBy: [],
			})),
		});
		writeLedger(run, {
			rows: [
				row("DS-5", "One", "draft", "-", "-", "[drafted]"),
				row("DS-6", "Two", "groom", "-", "-", "[groomed]"),
				row("DS-7", "Three", "triage", "-", "-", "[triage: wont-fix]"),
				...discover.map(([key, status]) =>
					row(key, "A discovery run", "discover", "-", "-", status),
				),
			],
		});
		for (const key of ["DS-5", "DS-6", "DS-7"]) {
			writeChange(run.repo, `${key.toLowerCase()}-change`, {
				"proposal.md": `Change for ${key}`,
			});
		}
		const { packet, missing } = build(run);
		const next = sectionOf(packet, "## Next command");

		const draftedBlock = blockFor(next, "DS-5", keys);
		expect(draftedBlock).toContain("/delivery DS-5");
		expect(draftedBlock).toContain("next step: execute");
		for (const key of ["DS-6", "DS-7"]) {
			const status = key === "DS-6" ? "[groomed]" : "[triage: wont-fix]";
			const action = expectedNext(key, status);
			if (action.kind === "run") throw new Error("expected a stop");
			expect(blockFor(next, key, keys)).toContain(
				`no command to type yet: ${action.reason}`,
			);
		}

		const [alpha, beta, gamma] = discover.map(([key]) => key) as [
			string,
			string,
			string,
		];
		const alphaBlock = blockFor(next, alpha, keys);
		expect(alphaBlock).toContain(`/delivery discover ${alpha}`);
		expect(alphaBlock).toContain("next step: discover");
		const betaBlock = blockFor(next, beta, keys);
		expect(betaBlock).toContain("next step: groom");
		expect(betaBlock).toContain(
			"no command to type yet: the next step is groom and its input is the approved one-pager the ledger names",
		);
		expect(next).not.toContain(`/delivery discover ${beta}`);
		const stopped = expectedNext(gamma, "[stopped: operator stopped]");
		if (stopped.kind === "run") throw new Error("expected a stop");
		const gammaBlock = blockFor(next, gamma, keys);
		expect(gammaBlock).toContain(`no command to type yet: ${stopped.reason}`);
		expect(gammaBlock).not.toContain("/delivery discover");

		expect([...missing].sort()).toEqual(
			discover.map(([key]) => `change files for ${key}`).sort(),
		);
		const files = sectionOf(packet, "## Change files");
		const lines = missingLines(files);
		for (const [key] of discover) {
			const line = lines.find((entry) =>
				entry.startsWith(`MISSING: change files for ${key}:`),
			);
			expect(line).toMatch(/discovery/i);
			expect(line).toMatch(/change folder/i);
		}
	});
});

describe("a missing piece is named, never dropped", () => {
	test("a run without a contract file names the contract and the criteria", () => {
		const run = newRun();
		writeLedger(run);
		writeChange(run.repo, CHANGE_NAME, CHANGE_FILES);
		const { packet, missing } = build(run);
		expect([...missing].sort()).toEqual([
			"acceptance criteria",
			"run contract",
		]);
		expect(headingsOf(packet)).toEqual(HEADINGS);
		const contractLines = missingLines(sectionOf(packet, "## Run contract"));
		const acceptanceLines = missingLines(
			sectionOf(packet, "## Acceptance criteria"),
		);
		expect(contractLines).toHaveLength(1);
		expect(contractLines[0]).toStartWith("MISSING: run contract: ");
		expect(acceptanceLines).toHaveLength(1);
		expect(acceptanceLines[0]).toStartWith("MISSING: acceptance criteria: ");
		const repeated = missingLines(sectionOf(packet, "## Missing pieces"));
		expect([...repeated].sort()).toEqual(
			[...contractLines, ...acceptanceLines].sort(),
		);
		expect(sectionOf(packet, "## Current status")).toContain("[drafted]");
		expect(sectionOf(packet, "## Next command")).toContain("/delivery DS-5");
		for (const line of CLEAN_DECISIONS) expect(packet).toContain(line);
		expect(sectionOf(packet, "## Change files")).toContain(
			"The ledger spreads state",
		);
	});

	test("a contract edited after it was frozen is named with the parser's hash message", () => {
		const run = newRun();
		writeContract(run, {}, (frozen) => ({ ...frozen, goal: "Edited later" }));
		writeLedger(run);
		writeChange(run.repo, CHANGE_NAME, CHANGE_FILES);
		const { packet, missing } = build(run);
		expect([...missing].sort()).toEqual([
			"acceptance criteria",
			"run contract",
		]);
		const contractLines = missingLines(sectionOf(packet, "## Run contract"));
		expect(contractLines).toHaveLength(1);
		expect(contractLines[0]).toContain(
			"run contract hash does not match its body",
		);
		expect(
			missingLines(sectionOf(packet, "## Acceptance criteria")),
		).toHaveLength(1);
		expect(packet).not.toContain("Edited later");
		expect(sectionOf(packet, "## Current status")).toContain("[drafted]");
		expect(sectionOf(packet, "## Change files")).toContain(
			"The ledger spreads state",
		);
	});

	test("a run with no ledger names the ledger pieces and finds change files from the contract's tickets", () => {
		const run = newRun();
		const frozen = writeContract(run);
		writeChange(run.repo, CHANGE_NAME, CHANGE_FILES);
		const { packet, missing } = build(run);
		expect([...missing].sort()).toEqual([
			"current status",
			"decisions so far",
			"next command",
		]);
		expect(packet.split("\n")[0]).toBe(`# Resume packet: ${run.id}`);
		expect(packet.split("\n")).toContain(`- Known by: ${run.id}`);
		for (const heading of [
			"## Current status",
			"## Next command",
			"## Decisions so far",
		]) {
			expect(missingLines(sectionOf(packet, heading))).toHaveLength(1);
		}
		expect(sectionOf(packet, "## Run contract")).toContain(frozen.goal);
		expect(sectionOf(packet, "## Acceptance criteria")).toContain(
			DEFAULT_TICKETS[0]?.acceptance[0] as string,
		);
		expect(sectionOf(packet, "## Change files")).toContain(
			"The ledger spreads state",
		);
	});

	test.each([
		[
			"a Keys row with the wrong number of cells",
			{
				rows: ["| DS-5 | Resume packet | execute | !12 | [drafted] |"],
				decisions: null,
			},
		],
		["a ledger with no Keys table", { rows: null, decisions: null }],
		["a Keys table with no rows", { rows: [], decisions: null }],
		[
			"a Keys table missing a required column",
			{
				tableHeader: [
					"| Key | Title | Stage | MR | Blocked by |",
					"|-----|-------|-------|----|------------|",
				],
				rows: ["| DS-5 | Resume packet | execute | !12 | DS-3 |"],
				decisions: null,
			},
		],
	] as Array<[string, LedgerSpec]>)(
		"%s names status, next command and decisions, and reads change files from the contract",
		(_name, spec) => {
			const run = newRun();
			writeContract(run);
			writeLedger(run, spec);
			writeChange(run.repo, CHANGE_NAME, CHANGE_FILES);
			const { packet, missing } = build(run);
			expect([...missing].sort()).toEqual([
				"current status",
				"decisions so far",
				"next command",
			]);
			const status = missingLines(sectionOf(packet, "## Current status"));
			const next = missingLines(sectionOf(packet, "## Next command"));
			const reasonOf = (line: string | undefined) =>
				(line ?? "").replace(/^MISSING: [^:]+: /, "");
			expect(reasonOf(status[0]).length).toBeGreaterThan(0);
			expect(reasonOf(next[0])).toBe(reasonOf(status[0]));
			expect(sectionOf(packet, "## Run contract")).not.toContain("MISSING:");
			expect(sectionOf(packet, "## Change files")).toContain(
				"The ledger spreads state",
			);
		},
	);

	test("with neither a readable ledger nor a contract the change files are one named gap", () => {
		const run = newRun();
		writeLedger(run, { rows: null });
		const { missing } = build(run);
		expect(missing).toContain("change files");
		expect(missing).toContain("run contract");
		expect(missing).toContain("current status");
	});

	test("a Decisions section with no bullet reads as none recorded, not as a gap", () => {
		const { run } = completeRun();
		writeLedger(run, { decisions: [] });
		const { packet, missing } = build(run);
		expect(missing).toEqual([]);
		expect(sectionOf(packet, "## Decisions so far")).toContain(
			"None recorded yet.",
		);
	});

	test.each(["", "-"])(
		"a Keys row with status %p names status and next command for that key only",
		(status) => {
			const run = newRun();
			writeContract(run, {
				tickets: ["DS-8", "DS-9"].map((key) => ({
					key,
					title: `Ticket ${key}`,
					acceptance: ["It works"],
					blockedBy: [],
				})),
			});
			writeLedger(run, {
				rows: [
					row("DS-8", "No status yet", "draft", "-", "-", status),
					row("DS-9", "Has a status", "execute", "-", "-", "[drafted]"),
				],
			});
			writeChange(run.repo, "ds-8-eight", { "proposal.md": "Eight" });
			writeChange(run.repo, "ds-9-nine", { "proposal.md": "Nine" });
			const { missing } = build(run);
			expect([...missing].sort()).toEqual([
				"current status for DS-8",
				"next command for DS-8",
			]);
		},
	);

	test("a key with no change folder and a key with two are named by key, and no change file text is copied", () => {
		const run = newRun();
		writeContract(run, {
			tickets: ["DS-8", "DS-9"].map((key) => ({
				key,
				title: `Ticket ${key}`,
				acceptance: ["It works"],
				blockedBy: [],
			})),
		});
		writeLedger(run, {
			rows: [
				row("DS-8", "No folder", "draft", "-", "-", ""),
				row("DS-9", "Two folders", "execute", "-", "-", "[drafted]"),
			],
		});
		writeChange(run.repo, "ds-9-alpha-change", {
			"proposal.md": "Alpha sentinel text",
		});
		writeChange(run.repo, "ds-9-beta-change", {
			"proposal.md": "Beta sentinel text",
		});
		const { packet, missing } = build(run);
		expect([...missing].sort()).toEqual([
			"change files for DS-8",
			"change files for DS-9",
			"current status for DS-8",
			"next command for DS-8",
		]);
		const lines = missingLines(sectionOf(packet, "## Change files"));
		const ambiguous = lines.find((line) =>
			line.startsWith("MISSING: change files for DS-9:"),
		);
		expect(ambiguous).toContain("ds-9-alpha-change");
		expect(ambiguous).toContain("ds-9-beta-change");
		expect(packet).not.toContain("Alpha sentinel text");
		expect(packet).not.toContain("Beta sentinel text");
	});

	test("a matching folder with no Markdown file is a named gap", () => {
		const run = newRun();
		writeContract(run);
		writeLedger(run);
		writeChange(run.repo, CHANGE_NAME, { "notes.txt": "plain text only" });
		const { packet, missing } = build(run);
		expect(missing).toEqual(["change files for DS-5"]);
		expect(packet).not.toContain("plain text only");
	});

	test("an archived change is found and an escaped pipe in a title is read as a plain pipe", () => {
		const run = newRun();
		writeContract(run);
		writeLedger(run, {
			rows: [row("DS-5", "Pipe \\| title", "archive", "!12", "-", "[drafted]")],
		});
		const archived = writeChange(
			run.repo,
			`archive/2026-10-19-${CHANGE_NAME}`,
			{
				"proposal.md": "Archived proposal text",
			},
		);
		const { packet, missing } = build(run);
		expect(missing).toEqual([]);
		const status = sectionOf(packet, "## Current status");
		expect(status).toContain("Pipe | title");
		expect(status).not.toContain("Pipe \\| title");
		const files = sectionOf(packet, "## Change files");
		expect(files).toContain(
			`openspec/changes/archive/2026-10-19-${CHANGE_NAME}`,
		);
		expect(files).toContain("Archived proposal text");
		expect(existsSync(archived)).toBe(true);
	});

	test("the repository root wins over the archive, and a worktree wins over the archive", () => {
		const run = newRun();
		writeContract(run, {
			tickets: ["DS-8", "DS-9"].map((key) => ({
				key,
				title: `Ticket ${key}`,
				acceptance: ["It works"],
				blockedBy: [],
			})),
		});
		writeLedger(run, {
			rows: [
				row("DS-8", "Root", "execute", "-", "-", "[drafted]"),
				row("DS-9", "Worktree", "execute", "-", "-", "[drafted]"),
			],
		});
		writeChange(run.repo, "ds-8-live", { "proposal.md": "Live root text" });
		writeChange(run.repo, "archive/2026-10-19-ds-8-old", {
			"proposal.md": "Old archived text",
		});
		writeChange(join(run.state, "worktrees", "DS-9"), "ds-9-live", {
			"proposal.md": "Live worktree text",
		});
		writeChange(run.repo, "archive/2026-10-19-ds-9-old", {
			"proposal.md": "Old archived worktree text",
		});
		const { packet, missing } = build(run);
		expect(missing).toEqual([]);
		expect(packet).toContain("Live root text");
		expect(packet).not.toContain("Old archived text");
		expect(packet).toContain("Live worktree text");
		expect(packet).not.toContain("Old archived worktree text");
	});
});

describe("a change in a worker worktree", () => {
	function twoWorktreeRun() {
		const run = newRun();
		const keys = ["DS-11", "DS-12"];
		writeContract(run, {
			tickets: keys.map((key) => ({
				key,
				title: `Ticket ${key}`,
				acceptance: ["It works"],
				blockedBy: [],
			})),
		});
		return { run, keys };
	}

	test("is found from the dispatched line and from the state root folder without writing in either", () => {
		const { run } = twoWorktreeRun();
		const worktreeA = join(run.base, "wt-a");
		writeChange(worktreeA, "ds-11-alpha-change", {
			"proposal.md": "Alpha worktree text",
		});
		writeChange(join(run.state, "worktrees", "DS-12"), "ds-12-beta-change", {
			"proposal.md": "Beta worktree text",
		});
		writeLedger(run, {
			rows: [
				row("DS-11", "Alpha", "execute", "-", "-", "[drafted]"),
				row("DS-12", "Beta", "execute", "-", "-", "[drafted]"),
			],
			decisions: [
				`- 2026-11-09 DS-11 — dispatched DS-11 to ${worktreeA} — fan-out — none`,
			],
		});
		const before = snapshot(run.base);
		const { packet, missing } = build(run);
		expect(missing).toEqual([]);
		expect(packet).toContain("Alpha worktree text");
		expect(packet).toContain("Beta worktree text");
		expect(changedPaths(before, snapshot(run.base))).toEqual([
			relative(run.base, packetPath(run)),
		]);
	});

	test("the latest dispatched line is the one used", () => {
		const { run } = twoWorktreeRun();
		const first = join(run.base, "wt-first");
		const second = join(run.base, "wt-second");
		writeChange(first, "ds-11-first", { "proposal.md": "First dispatch text" });
		writeChange(second, "ds-11-second", {
			"proposal.md": "Second dispatch text",
		});
		writeLedger(run, {
			rows: [row("DS-11", "Alpha", "execute", "-", "-", "[drafted]")],
			decisions: [
				`- 2026-11-08 DS-11 — dispatched DS-11 to ${first} — fan-out — none`,
				`- 2026-11-09 DS-11 — dispatched DS-11 to ${second} — fan-out again — none`,
			],
		});
		const { packet } = build(run);
		expect(packet).toContain("Second dispatch text");
		expect(packet).not.toContain("First dispatch text");
	});

	test.each([
		["a directory that does not exist", (base: string) => join(base, "gone")],
		["a relative path", () => "wt-relative"],
	])(
		"a dispatched line naming %s falls back to the state root folder",
		(_name, pick) => {
			const { run } = twoWorktreeRun();
			writeChange(join(run.state, "worktrees", "DS-11"), "ds-11-fallback", {
				"proposal.md": "Fallback worktree text",
			});
			writeLedger(run, {
				rows: [row("DS-11", "Alpha", "execute", "-", "-", "[drafted]")],
				decisions: [
					`- 2026-11-09 DS-11 — dispatched DS-11 to ${pick(run.base)} — fan-out — none`,
				],
			});
			const { packet, missing } = build(run);
			expect(missing).toEqual([]);
			expect(packet).toContain("Fallback worktree text");
		},
	);
});

describe("a run that exists nowhere, or an unsafe run id, is refused", () => {
	test("a run with neither a ledger nor a contract exits 1 and writes nothing", () => {
		const run = newRun("ds-ghost");
		const before = snapshot(run.base);
		const result = cli(["build", run.repo, run.id]);
		expect(result.code).toBe(1);
		expect(result.output).toContain("ds-ghost");
		expect(existsSync(packetPath(run))).toBe(false);
		expect(changedPaths(before, snapshot(run.base))).toEqual([]);
	});

	test.each(["../escape", "a/b", "-lead", "has space", "dot.name"])(
		"the run id %p is refused for build and where",
		(id) => {
			const run = newRun();
			writeContract(run);
			writeLedger(run);
			const before = snapshot(run.base);
			for (const mode of ["build", "where"]) {
				const result = cli([mode, run.repo, id]);
				expect(result.code).toBe(1);
				expect(result.output.toLowerCase()).toMatch(
					new RegExp(`invalid|${id.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")}`),
				);
			}
			expect(changedPaths(before, snapshot(run.base))).toEqual([]);
		},
	);

	test.each([
		[["build"]],
		[["build", "repo-only"]],
		[["build", "repo", "id", "extra"]],
		[["where", "repo-only"]],
		[["where", "repo", "id", "extra"]],
		[[]],
		[["unknown-mode", "repo", "id"]],
	])("the arguments %p exit 2 with the usage line", (args) => {
		const result = cli(args);
		expect(result.code).toBe(2);
		expect(result.output).toMatch(/usage/i);
		expect(result.output).toContain("resume-packet");
	});
});

describe("the packet is paste-safe by withholding", () => {
	const PGP_BODY = ["planted pgp body alpha", "planted pgp body beta"];
	const WITHHELD_LINE = `MISSING: decisions so far: ${WITHHELD}; read it in the ledger`;

	const planted: Array<{ line: string; value: string; phrase: string }> = [
		{
			line: "- 2026-11-09 run — set DB_PASSWORD=ql7planteddbvalue on the staging database — config — none",
			value: "ql7planteddbvalue",
			phrase: "staging database",
		},
		{
			line: '- 2026-11-09 run — posted {"password": "plantedjsonpw2"} to the login form — repro — none',
			value: "plantedjsonpw2",
			phrase: "login form",
		},
		{
			line: "- 2026-11-09 run — sent the header Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJwbGFudGVkIn0.c2lnbmF0dXJlcGxhbnRlZA to the mirror — repro — none",
			value: "eyJzdWIiOiJwbGFudGVkIn0",
			phrase: "to the mirror",
		},
		{
			line: "- 2026-11-09 run — client config apiKey: plantedapikeyvalue4 for the map widget — config — none",
			value: "plantedapikeyvalue4",
			phrase: "map widget",
		},
		{
			line: "- 2026-11-09 run — curl header X-API-Key: plantedxapikey5 on the health probe — config — none",
			value: "plantedxapikey5",
			phrase: "health probe",
		},
		{
			line: "- 2026-11-09 run — exported with passphrase=plantedphrase6 for the backup bundle — config — none",
			value: "plantedphrase6",
			phrase: "backup bundle",
		},
		{
			line: "- 2026-11-09 run — embedded https://maps.example.test/embed?key=plantedquery7 in the docs page — link — none",
			value: "plantedquery7",
			phrase: "docs page",
		},
		{
			line: "- 2026-11-09 run — installation ghs_Plantedghs8Value1234567890abcdefghij logged by the bot — log — none",
			value: "Plantedghs8Value1234567890abcdefghij",
			phrase: "logged by the bot",
		},
		{
			line: "- 2026-11-09 run — runner registered with glrt-plantedglrt9value on the shared pool — log — none",
			value: "plantedglrt9value",
			phrase: "shared pool",
		},
		{
			line: "- 2026-11-09 run — cloud account AKIAIOSFODNN7EXAMPLE was rotated — log — none",
			value: "AKIAIOSFODNN7EXAMPLE",
			phrase: "cloud account",
		},
		{
			line: "- 2026-11-09 run — geocoding service AIzaSyD-planted11A1b2C3d4E5f6G7h8I9j0KL was rotated — log — none",
			value: "AIzaSyD-planted11A1b2C3d4E5f6G7h8I9j0KL",
			phrase: "geocoding service",
		},
		{
			line: "- 2026-11-09 run — cloned from https://plantedtoken12@git.example.test/team/repo.git for the mirror run — log — none",
			value: "plantedtoken12",
			phrase: "mirror run",
		},
		{
			line: "- 2026-11-09 run — wrote the blob Zm9vYmFyYmF6cXV4cXV1eFplbWFnaWNhbGx5bG9u to disk — log — none",
			value: "Zm9vYmFyYmF6cXV4cXV1eFplbWFnaWNhbGx5bG9u",
			phrase: "to disk",
		},
		{
			line: "- 2026-11-09 run — file checksum 9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08 recorded — log — none",
			value: "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08",
			phrase: "file checksum",
		},
	];

	test("the planted fixtures have the shapes the spec names", () => {
		expect("AIzaSyD-planted11A1b2C3d4E5f6G7h8I9j0KL").toHaveLength(39);
		expect("Zm9vYmFyYmF6cXV4cXV1eFplbWFnaWNhbGx5bG9u").toHaveLength(40);
		expect(
			"9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08",
		).toHaveLength(64);
	});

	test("each detector withholds its whole line, and a private key block as one", () => {
		const run = newRun();
		writeContract(run);
		writeChange(run.repo, CHANGE_NAME, {
			"proposal.md": "Plain proposal text",
		});
		const clean =
			"- 2026-11-09 run — kept this ordinary decision line beside the planted ones — plain reason — none";
		const pgpBlock = [
			"- -----BEGIN PGP PRIVATE KEY BLOCK-----",
			...PGP_BODY,
			"-----END PGP PRIVATE KEY BLOCK-----",
		];
		const ledgerPath = writeLedger(run, {
			decisions: [
				clean,
				...planted.map((entry) => entry.line),
				...pgpBlock,
				clean.replace("kept", "kept again"),
			],
		});
		const ledgerBefore = readFileSync(ledgerPath, "utf8");
		const { packet, missing } = build(run);

		for (const entry of planted) {
			expect(packet).not.toContain(entry.line);
			expect(packet).not.toContain(entry.value);
			expect(packet).not.toContain(entry.phrase);
		}
		for (const body of PGP_BODY) expect(packet).not.toContain(body);
		expect(packet).not.toContain("PGP PRIVATE KEY");

		const decisions = sectionOf(packet, "## Decisions so far");
		const expectedCount = planted.length + 1;
		expect(missingLines(decisions)).toEqual(
			Array(expectedCount).fill(WITHHELD_LINE),
		);
		expect(decisions).toContain(clean);
		expect(decisions).toContain(clean.replace("kept", "kept again"));
		expect(missingLines(sectionOf(packet, "## Missing pieces"))).toEqual(
			Array(expectedCount).fill(WITHHELD_LINE),
		);
		expect(missing).toEqual(Array(expectedCount).fill("decisions so far"));
		expect(readFileSync(ledgerPath, "utf8")).toBe(ledgerBefore);
	});

	test("the line rules sit at their stated thresholds and boundaries", () => {
		const line = (text: string) =>
			`- 2026-11-09 run — sample ${text} here — r — none`;
		const cases: Array<{ text: string; withheld: boolean }> = [
			{ text: "abcdefghijklmnopqrstuvwxyz01234", withheld: false },
			{ text: "abcdefghijklmnopqrstuvwxyz012345", withheld: true },
			{ text: "Abcdefghijklmnopqrstuv0", withheld: false },
			{ text: "Abcdefghijklmnopqrstuv01", withheld: true },
			{ text: "ABCDEFGHIJKLMNOPQRSTUVWX1", withheld: false },
			{ text: "abcdefghijklmnopqrstuvwxyz-0123456789", withheld: false },
			{ text: "snake_case_name_with_underscores_9", withheld: false },
			{
				text: "abcdefghijklmnopqrst0/abcdefghijklmnopqrst0/abcdefghijklmnopqrst0",
				withheld: false,
			},
			{ text: "author: the operator", withheld: true },
			{ text: "Password: placeholder", withheld: true },
			{ text: "key: placeholder", withheld: true },
			{ text: "monkey: placeholder", withheld: false },
			{
				text: "the token budget and secret handling were discussed",
				withheld: false,
			},
			{ text: "task-list and desk-chair were renamed", withheld: false },
			{ text: "sk-planted12345 was pasted", withheld: true },
			{ text: "akiaplanted was typed", withheld: false },
			{ text: "ops@example.test was cc'd", withheld: false },
			{
				text: "https://git.example.test/team/repo@v2 was tagged",
				withheld: false,
			},
			{
				text: `a bare hash ${SHA256.slice(7)} sits unprefixed`,
				withheld: true,
			},
			{ text: `the hash ${SHA256} is prefixed`, withheld: false },
		];
		const run = newRun();
		writeContract(run);
		writeChange(run.repo, CHANGE_NAME, {
			"proposal.md": "Plain proposal text",
		});
		writeLedger(run, { decisions: cases.map((entry) => line(entry.text)) });
		const { packet, missing } = build(run);
		const decisions = sectionOf(packet, "## Decisions so far");
		for (const entry of cases) {
			if (entry.withheld) expect(decisions).not.toContain(line(entry.text));
			else expect(decisions).toContain(line(entry.text));
		}
		const withheldCount = cases.filter((entry) => entry.withheld).length;
		expect(missing).toEqual(Array(withheldCount).fill("decisions so far"));
	});

	test("the same rule covers every other copied field and the change files", () => {
		const run = newRun();
		writeContract(
			run,
			{
				goal: "Ship it with password=goalplanted1 inside",
				scope: ["password=scopeplanted2", "Name the packet in status"],
				tickets: [
					{
						key: "DS-5",
						title: "Paste-safe resume packet per run",
						acceptance: [
							"password=acceptplanted3",
							"Given a missing piece, when built, then it is named",
						],
						blockedBy: [],
					},
				],
			},
			(frozen) => frozen,
		);
		const ledgerPath = writeLedger(run, {
			title: "password=ledgerplanted5 for the run",
			ids: "password=idsplanted6",
			rows: [
				row(
					"DS-5",
					"password=titleplanted4",
					"execute",
					"!12",
					"-",
					"[drafted]",
				),
			],
		});
		const filePath = join(
			writeChange(run.repo, CHANGE_NAME, {
				"proposal.md": [
					"First clean line of the change",
					"password=filelineplanted7",
					"Last clean line of the change",
				].join("\n"),
			}),
			"proposal.md",
		);
		const sources = [
			ledgerPath,
			filePath,
			join(run.state, "runs", `${run.id}.run-contract.json`),
		];
		const sourcesBefore = sources.map((path) => readFileSync(path, "utf8"));
		const { packet, missing } = build(run);

		for (const value of [
			"goalplanted1",
			"scopeplanted2",
			"acceptplanted3",
			"titleplanted4",
			"ledgerplanted5",
			"idsplanted6",
			"filelineplanted7",
		]) {
			expect(packet).not.toContain(value);
		}
		const inContract = `${WITHHELD}; read it in the run contract`;
		expect(
			missingLines(sectionOf(packet, "## Run contract")).filter(
				(entry) => entry === `MISSING: run contract: ${inContract}`,
			),
		).toHaveLength(2);
		expect(sectionOf(packet, "## Acceptance criteria")).toContain(
			`MISSING: acceptance criteria for DS-5: ${inContract}`,
		);
		expect(sectionOf(packet, "## Current status")).toContain(
			`MISSING: current status for DS-5: ${WITHHELD}; read it in the ledger`,
		);
		expect(sectionOf(packet, "## Next command")).toContain(
			"MISSING: next command for DS-5: ",
		);
		const files = sectionOf(packet, "## Change files");
		expect(files).toContain(
			`MISSING: change files for DS-5: ${WITHHELD}; read it in the change file`,
		);
		expect(files).toContain("First clean line of the change");
		expect(files).toContain("Last clean line of the change");

		expect(packet.split("\n")[0]).toBe(`# Resume packet: ${run.id}`);
		expect(packet.split("\n")).toContain(`- Known by: ${WITHHELD}`);
		const pieces = sectionOf(packet, "## Missing pieces");
		expect(pieces).toMatch(/^MISSING: title: /m);
		expect(pieces).toMatch(/^MISSING: ids: /m);
		expect([...missing].sort()).toEqual(
			[
				"acceptance criteria for DS-5",
				"change files for DS-5",
				"current status for DS-5",
				"ids",
				"next command for DS-5",
				"run contract",
				"run contract",
				"title",
			].sort(),
		);
		expect(sources.map((path) => readFileSync(path, "utf8"))).toEqual(
			sourcesBefore,
		);
	});

	test("a private key block in a change file is withheld through its end line, or to the end of the file", () => {
		const run = newRun();
		writeContract(run);
		writeLedger(run);
		writeChange(run.repo, CHANGE_NAME, {
			"proposal.md": [
				"Clean line before the block",
				"-----BEGIN RSA PRIVATE KEY-----",
				"plantedrsabodyone",
				"plantedrsabodytwo",
				"-----END RSA PRIVATE KEY-----",
				"Clean line after the block",
			].join("\n"),
			"tail.md": [
				"Clean line before the open block",
				"-----BEGIN OPENSSH PRIVATE KEY-----",
				"plantedopensshbodyone",
				"plantedopensshbodytwo",
			].join("\n"),
		});
		const { packet, missing } = build(run);
		for (const value of [
			"plantedrsabodyone",
			"plantedrsabodytwo",
			"plantedopensshbodyone",
			"plantedopensshbodytwo",
			"PRIVATE KEY",
		]) {
			expect(packet).not.toContain(value);
		}
		const files = sectionOf(packet, "## Change files");
		expect(files).toContain("Clean line before the block");
		expect(files).toContain("Clean line after the block");
		expect(files).toContain("Clean line before the open block");
		expect(missing).toEqual(["change files for DS-5", "change files for DS-5"]);
	});

	test("a reason that carries text is withheld too, and a parser message never quotes a row", () => {
		const run = newRun();
		writeOutdatedContract(run, "api_key=retiredplanted9");
		writeLedger(run, {
			rows: ["| DS-5 | password=rowplanted8 | execute | [drafted] |"],
		});
		writeChange(run.repo, CHANGE_NAME, CHANGE_FILES);
		const { packet } = build(run);
		expect(packet).not.toContain("retiredplanted9");
		expect(packet).not.toContain("rowplanted8");
		expect(sectionOf(packet, "## Run contract")).toContain(
			"MISSING: run contract: reason withheld because it may carry a secret",
		);
		const status = missingLines(sectionOf(packet, "## Current status"));
		expect(status).toHaveLength(1);
		expect(status[0]).toMatch(
			/^MISSING: current status: (?=.*\brow\b)(?=.*\d)/i,
		);
	});

	test("a candidate folder name that carries a secret shape withholds the lookup's reason", () => {
		const run = newRun();
		writeContract(run);
		writeLedger(run);
		writeChange(run.repo, "ds-5-alpha", { "proposal.md": "Alpha" });
		writeChange(run.repo, "ds-5-secret=plantedfolder13", {
			"proposal.md": "Beta",
		});
		const { packet, missing } = build(run);
		expect(packet).not.toContain("plantedfolder13");
		expect(missing).toEqual(["change files for DS-5"]);
		expect(sectionOf(packet, "## Change files")).toContain(
			"MISSING: change files for DS-5: reason withheld because it may carry a secret",
		);
	});

	test("fields that can carry secrets are never copied", () => {
		const { run } = completeRun();
		const sentinels = {
			target: "quokka-target-sentinel",
			discovery: "quokka-discovery-sentinel",
			verdicts: "quokka-verdict-sentinel",
			approvals: "quokka-approval-sentinel",
			stops: "quokka-stop-sentinel",
			lessons: "quokka-lesson-sentinel",
			who: "quokka-who-sentinel",
			words: "quokka-words-sentinel",
			deliveryJson: "quokka-deliveryjson-sentinel",
			nonMarkdown: "quokka-nonmarkdown-sentinel",
			worker: "quokka-worker-sentinel",
			lock: "quokka-lock-sentinel",
			env: "quokka-env-sentinel",
		};
		writeContract(run, {
			approval: {
				who: sentinels.who,
				words: sentinels.words,
				at: "2026-11-09T00:00:00.000Z",
			},
		});
		writeLedger(run, {
			headerExtra: [
				`Target repo: ${sentinels.target}`,
				`Discovery: ${sentinels.discovery}`,
			],
			trailer: [
				"## Approvals",
				"",
				`- 2026-11-09 run — plan approved — someone — "${sentinels.approvals}"`,
				"",
				"## Stops",
				"",
				`- 2026-11-09 DS-5 execute — ${sentinels.stops} — /delivery DS-5`,
				"",
				"## Lessons",
				"",
				`- 2026-11-09 class — 1 — ${sentinels.lessons} — backlog`,
			],
		});
		const verdictsPath = join(run.state, "runs", `${run.id}.md`);
		writeFileSync(
			verdictsPath,
			readFileSync(verdictsPath, "utf8").replace(
				"| Date | MR | Kind |",
				`| Date | MR | Kind |\n| ${sentinels.verdicts} | !1 | review |`,
			),
		);
		const changeDir = join(run.repo, "openspec", "changes", CHANGE_NAME);
		writeFileSync(join(changeDir, ".delivery.json"), sentinels.deliveryJson);
		writeFileSync(join(changeDir, "evidence.txt"), sentinels.nonMarkdown);
		writeFileSync(join(changeDir, ".openspec.yaml"), sentinels.nonMarkdown);
		mkdirSync(join(run.state, "workers", run.id), { recursive: true });
		writeFileSync(
			join(run.state, "workers", run.id, "DS-5.md"),
			sentinels.worker,
		);
		mkdirSync(join(run.state, "runs", `${run.id}.lock`), { recursive: true });
		writeFileSync(
			join(run.state, "runs", `${run.id}.lock`, "owner.json"),
			sentinels.lock,
		);
		const { packet, missing } = build(run, {
			RESUME_PACKET_TEST_ENV: sentinels.env,
		});
		expect(missing).toEqual([]);
		for (const sentinel of Object.values(sentinels)) {
			expect(packet).not.toContain(sentinel);
		}
	});
});

describe("the preamble states only what the packet does", () => {
	function preambleOf(packet: string): string {
		const end = packet.indexOf("\n## ");
		return packet.slice(0, end);
	}

	test.each(["complete", "with gaps"])(
		"a %s packet names what is left out and what is withheld, and promises nothing more",
		(kind) => {
			const run = kind === "complete" ? completeRun().run : newRun();
			if (kind !== "complete") writeLedger(run, { decisions: null });
			const { packet } = build(run);
			const preamble = preambleOf(packet);
			expect(preamble).toContain(LEFT_OUT_LINE);
			expect(preamble).toContain(WITHHELD_NOTE);
			expect(packet).not.toContain("[redacted]");
			expect(packet).not.toMatch(/redact/i);
			expect(packet).not.toMatch(
				/free of (any )?secrets?|no secrets?|secret-free|is clean|are clean|contains nothing sensitive/i,
			);
		},
	);
});

describe("status names where the packet is", () => {
	test("where reports the path and whether a packet exists, and writes nothing", () => {
		const { run } = completeRun();
		const before = snapshot(run.base);
		const first = cli(["where", run.repo, run.id]);
		expect(first.code).toBe(0);
		const firstJson = JSON.parse(first.stdout.trim()) as {
			path: string;
			exists: boolean;
		};
		expect(Object.keys(firstJson).sort()).toEqual(["exists", "path"]);
		expect(firstJson.exists).toBe(false);
		expect(firstJson.path.endsWith(join("packets", `${run.id}.md`))).toBe(true);
		expect(changedPaths(before, snapshot(run.base))).toEqual([]);
		expect(existsSync(join(run.state, "packets"))).toBe(false);

		const built = build(run);
		const last = cli(["where", run.repo, run.id]);
		expect(last.code).toBe(0);
		const lastJson = JSON.parse(last.stdout.trim()) as {
			path: string;
			exists: boolean;
		};
		expect(lastJson.exists).toBe(true);
		expect(lastJson.path).toBe(firstJson.path);
		expect(lastJson.path).toBe(built.path);
	});
});

describe("the skill and the ledger describe the packet", () => {
	const SKILL = readFileSync(join(SKILL_ROOT, "SKILL.md"), "utf8");
	const ENTRIES = readFileSync(
		join(SKILL_ROOT, "reference", "entries.md"),
		"utf8",
	);
	const LEDGER = readFileSync(
		join(SKILL_ROOT, "workflows", "delivery-ledger.md"),
		"utf8",
	);

	function skillForm(invocation: string): string {
		const [path, ...args] = invocation.split(" ");
		return `bun "\${FACTORY_ROOT}/${path}" ${args.join(" ")}`;
	}

	test("the status entry runs where, reports the path, says when none is written, and never runs build", () => {
		expect(SKILL).toContain("**Entry S — Status**");
		expect(SKILL).toContain("`reference/entries.md`");
		const entry = section(ENTRIES, "## Entry S — Status");
		expect(entry).toContain(skillForm(RESUME_PACKET_WHERE_INVOCATION));
		expect(entry).toMatch(/path/i);
		expect(entry).toContain("no packet has been written");
		expect(entry).not.toContain(skillForm(RESUME_PACKET_BUILD_INVOCATION));
		expect(entry).not.toMatch(/resume-packet\.ts"? build/);
	});

	test("the stage boundaries write the packet before the session changes hands, and a worker never writes it", () => {
		const boundaries = section(SKILL, "## Stage boundaries");
		expect(boundaries).toContain(skillForm(RESUME_PACKET_BUILD_INVOCATION));
		expect(boundaries).toContain("Clear");
		expect(boundaries).toContain("Fan-out brief");
		expect(boundaries).toMatch(/compact/i);
		const at = boundaries.indexOf("DELIVERY_WORKER_JOURNAL");
		expect(at).toBeGreaterThan(-1);
		expect(boundaries.slice(Math.max(0, at - 300), at + 300)).toMatch(/never/i);
	});

	test("the ledger lists the packet under the state root as a derived copy", () => {
		const location = section(LEDGER, "## Location and identity");
		expect(location).toContain("packets/<run-id>.md");
		expect(location).toMatch(/derived copy/i);
		expect(location).toMatch(/source of truth/i);
	});
});

function section(doc: string, heading: string): string {
	const lines = doc.split("\n");
	const start = lines.indexOf(heading);
	if (start < 0) throw new Error(`missing section ${heading}`);
	const level = heading.match(/^#+/)?.[0].length ?? 2;
	const body: string[] = [];
	let fenced = false;
	for (const line of lines.slice(start + 1)) {
		if (line.startsWith("```")) fenced = !fenced;
		const depth = line.match(/^(#+) /)?.[1]?.length;
		if (!fenced && depth !== undefined && depth <= level) break;
		body.push(line);
	}
	return body.join("\n");
}
