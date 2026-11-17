import {
	existsSync,
	mkdirSync,
	readFileSync,
	readdirSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { findChange } from "./find-change";
import { resolveStateRoot } from "./improvement-state";
import { selectNextAction } from "./next-action";
import { fence, specSections } from "./review-packet";
import {
	type FrozenRunContract,
	parseFrozenRunContract,
} from "./sdlc-constitution";

// biome-ignore format: the workflow contract reads each invocation as one double-quoted literal
// prettier-ignore
export const RESUME_PACKET_BUILD_INVOCATION = "scripts/resume-packet.ts build <repo-root> <run-id>";
// biome-ignore format: the workflow contract reads each invocation as one double-quoted literal
// prettier-ignore
export const RESUME_PACKET_WHERE_INVOCATION = "scripts/resume-packet.ts where <repo-root> <run-id>";

const USAGE = `usage: ${RESUME_PACKET_BUILD_INVOCATION}\n       ${RESUME_PACKET_WHERE_INVOCATION}`;

const RUN_ID = /^[a-z0-9][a-z0-9-]*$/i;
const COLUMNS = ["Key", "Title", "Stage", "MR", "Blocked by", "Status"];
const LEFT_OUT_LINE =
	"Left out on purpose: the ledger's approvals, verdicts, stops, lessons, and header fields other than its title and ids; the run contract's approval block; non-Markdown files in a change folder; and environment variables.";
const WITHHELD_NOTE =
	"Lines that may carry a secret are withheld and shown as MISSING lines. Every other line is copied as written.";
const DERIVED_NOTE =
	"This packet is a derived copy. The run ledger stays the source of truth.";
const WITHHELD = "withheld because it may carry a secret";
const REASON_WITHHELD = "reason withheld because it may carry a secret";
const DISCOVERY_STAND_IN = "DISCOVER-0";

const KEY_WORD =
	/(?:token|secret|passw|passphrase|pwd|credential|auth|api_key|apikey|api-key)[A-Za-z0-9_-]*["']?\s*[:=]/i;
const BARE_KEY_WORD = /(?<![A-Za-z0-9_-])key["']?\s*[:=]/i;
const URL_USER_INFO = /[A-Za-z][A-Za-z0-9+.-]*:\/\/[^\s/@]+@/;
const PRIVATE_KEY_MARKER = /-----BEGIN[^\n]*PRIVATE KEY[^\n]*-----/i;
const PRIVATE_KEY_END = /-----END/i;
const TOKEN_PREFIX =
	/(?<![A-Za-z0-9])(?:ghp_|gho_|ghs_|ghu_|ghr_|github_pat_|glpat-|glrt-|gldt-|glptt-|gloas-|xox|sk-|AKIA)/;

function suspicious(line: string): boolean {
	if (
		KEY_WORD.test(line) ||
		BARE_KEY_WORD.test(line) ||
		URL_USER_INFO.test(line) ||
		PRIVATE_KEY_MARKER.test(line) ||
		TOKEN_PREFIX.test(line)
	) {
		return true;
	}
	for (const run of line.matchAll(/[A-Za-z0-9+]{32,}/g)) {
		const hash =
			run[0].length === 64 &&
			/^[0-9a-f]+$/.test(run[0]) &&
			line.slice(Math.max(0, run.index - 7), run.index) === "sha256:";
		if (!hash) return true;
	}
	for (const run of line.matchAll(/[A-Za-z0-9_-]{24,}/g)) {
		if (/\d/.test(run[0]) && /[A-Z]/.test(run[0]) && /[a-z]/.test(run[0])) {
			return true;
		}
	}
	return false;
}

// A string entry is a line to copy; null is a line or private key block withheld.
function scanLines(
	lines: string[],
	keep: (line: string) => boolean,
): Array<string | null> {
	const out: Array<string | null> = [];
	let inBlock = false;
	for (const line of lines) {
		if (inBlock) {
			if (PRIVATE_KEY_END.test(line)) inBlock = false;
			continue;
		}
		if (PRIVATE_KEY_MARKER.test(line)) {
			out.push(null);
			inBlock = true;
			continue;
		}
		if (!keep(line)) continue;
		out.push(suspicious(line) ? null : line);
	}
	return out;
}

function inline(text: string): string {
	return text.replace(/\s*\r?\n\s*/g, " ");
}

function reasonText(message: string): string {
	const reason = inline(message);
	return suspicious(reason) ? REASON_WITHHELD : reason;
}

function sectionLines(text: string, heading: string): string[] | null {
	const lines = text.split("\n");
	const start = lines.findIndex((line) => line.trimEnd() === heading);
	if (start < 0) return null;
	const body: string[] = [];
	for (const line of lines.slice(start + 1)) {
		if (/^## /.test(line)) break;
		body.push(line);
	}
	return body;
}

function cells(line: string): string[] {
	const trimmed = line.trim();
	const parts = trimmed
		.split(/(?<!\\)\|/)
		.map((cell) => cell.trim().replace(/\\\|/g, "|"));
	if (trimmed.startsWith("|")) parts.shift();
	if (/(?<!\\)\|$/.test(trimmed)) parts.pop();
	return parts;
}

interface KeyRow {
	n: number;
	raw: string;
	key: string;
	title: string;
	stage: string;
	mr: string;
	blockedBy: string;
	status: string;
}

type Keys = { rows: KeyRow[] } | { error: string };

function parseKeys(ledger: string): Keys {
	const section = sectionLines(ledger, "## Keys");
	const table: string[] = [];
	for (const line of section ?? []) {
		if (line.trimStart().startsWith("|")) table.push(line.trim());
		else if (table.length > 0) break;
	}
	const headerLine = table[0];
	if (headerLine === undefined)
		return { error: "the ledger has no Keys table" };
	const header = cells(headerLine);
	const at: Record<string, number> = {};
	for (const column of COLUMNS) {
		const index = header.indexOf(column);
		if (index < 0) return { error: `the Keys table has no ${column} column` };
		at[column] = index;
	}
	const separator = table[1] !== undefined && /^[|\s:-]+$/.test(table[1]);
	const body = table.slice(separator ? 2 : 1);
	if (body.length === 0) return { error: "the Keys table has no rows" };
	const rows: KeyRow[] = [];
	for (const [i, raw] of body.entries()) {
		const row = cells(raw);
		if (row.length !== header.length) {
			return {
				error: `Keys row ${i + 1} has a different number of cells than the header`,
			};
		}
		const get = (column: string) => row[at[column] as number] as string;
		rows.push({
			n: i + 1,
			raw,
			key: get("Key"),
			title: get("Title"),
			stage: get("Stage"),
			mr: get("MR"),
			blockedBy: get("Blocked by"),
			status: get("Status"),
		});
	}
	return { rows };
}

function isDiscovery(key: string): boolean {
	return key.startsWith("discover-");
}

function listDirectories(dir: string): string[] {
	try {
		return readdirSync(dir, { withFileTypes: true })
			.filter((entry) => entry.isDirectory())
			.map((entry) => entry.name);
	} catch {
		return [];
	}
}

function isDirectory(path: string): boolean {
	try {
		return statSync(path).isDirectory();
	} catch {
		return false;
	}
}

function latestDispatchedPath(decisions: string[], key: string): string | null {
	let found: string | null = null;
	for (const line of decisions) {
		const match = line.match(/dispatched (\S+) to (.+?)(?: — |$)/);
		if (match && (match[1] as string).toLowerCase() === key.toLowerCase()) {
			found = match[2] as string;
		}
	}
	return found;
}

type ChangeLookup = { dir: string; display: string } | { reason: string };

function lookupChange(
	key: string,
	repoRoot: string,
	stateRoot: string,
	decisions: string[],
): ChangeLookup {
	if (isDiscovery(key)) {
		return { reason: "a discovery run has no change folder" };
	}
	const places: Array<{ changes: string; display: (name: string) => string }> =
		[
			{
				changes: join(repoRoot, "openspec", "changes"),
				display: (name) => `openspec/changes/${name}`,
			},
		];
	const dispatched = latestDispatchedPath(decisions, key);
	const worktrees: string[] = [];
	if (dispatched && isAbsolute(dispatched) && isDirectory(dispatched)) {
		worktrees.push(dispatched);
	}
	if (RUN_ID.test(key)) worktrees.push(join(stateRoot, "worktrees", key));
	for (const worktree of worktrees) {
		const changes = join(worktree, "openspec", "changes");
		places.push({ changes, display: (name) => join(changes, name) });
	}
	for (const place of places) {
		let result: ReturnType<typeof findChange>;
		try {
			result = findChange(key, listDirectories(place.changes));
		} catch (error) {
			return {
				reason: reasonText(
					error instanceof Error ? error.message : String(error),
				),
			};
		}
		if (result.match) {
			return {
				dir: join(place.changes, result.match),
				display: place.display(result.match),
			};
		}
		if (result.ambiguous) {
			return {
				reason: reasonText(
					`several change folders match ${key}: ${result.candidates.join(", ")}`,
				),
			};
		}
	}
	const archive = join(repoRoot, "openspec", "changes", "archive");
	const real = listDirectories(archive);
	const strip = (name: string) => name.replace(/^\d{4}-\d{2}-\d{2}-/, "");
	const result = findChange(key, real.map(strip));
	if (result.match) {
		const name = real.find((entry) => strip(entry) === result.match) as string;
		return {
			dir: join(archive, name),
			display: `openspec/changes/archive/${name}`,
		};
	}
	if (result.ambiguous) {
		const names = real.filter((entry) =>
			result.candidates.includes(strip(entry)),
		);
		return {
			reason: reasonText(
				`several change folders match ${key}: ${names.join(", ")}`,
			),
		};
	}
	return {
		reason: `no change folder matches ${key} in the repository, a worker worktree, or the archive`,
	};
}

type ContractResult = { contract: FrozenRunContract } | { reason: string };

function readContract(path: string): ContractResult {
	if (!existsSync(path)) return { reason: "the run contract file is absent" };
	let raw: unknown;
	try {
		raw = JSON.parse(readFileSync(path, "utf8"));
	} catch {
		return { reason: "the run contract file is not valid JSON" };
	}
	try {
		return { contract: parseFrozenRunContract(raw) };
	} catch (error) {
		return {
			reason: reasonText(
				error instanceof Error ? error.message : String(error),
			),
		};
	}
}

function nextCommandLines(key: string, status: string): string[] {
	const entry = isDiscovery(key) ? DISCOVERY_STAND_IN : key;
	const action = selectNextAction({ args: entry, status });
	if (action.kind !== "run") {
		return [`${key}: no command to type yet: ${action.reason}`];
	}
	if (!isDiscovery(key)) {
		return [`${key}: /delivery ${key}`, `next step: ${action.verb}`];
	}
	if (action.verb === "discover") {
		return [`${key}: /delivery discover ${key}`, "next step: discover"];
	}
	return [
		`${key}: no command to type yet: the next step is ${action.verb} and its input is the approved one-pager the ledger names`,
		`next step: ${action.verb}`,
	];
}

interface PacketResult {
	path: string;
	missing: string[];
}

class RefusedRun extends Error {}

function stateRootFor(repoRoot: string): string {
	return resolve(
		resolveStateRoot(
			{ DELIVERY_STATE_ROOT: process.env.DELIVERY_STATE_ROOT },
			repoRoot,
		),
	);
}

function packetPathFor(repoRoot: string, runId: string): string {
	return join(stateRootFor(resolve(repoRoot)), "packets", `${runId}.md`);
}

function buildPacket(repoRootArg: string, runId: string): PacketResult {
	const repoRoot = resolve(repoRootArg);
	const stateRoot = stateRootFor(repoRoot);
	const ledgerPath = join(stateRoot, "runs", `${runId}.md`);
	const contractPath = join(stateRoot, "runs", `${runId}.run-contract.json`);
	if (!existsSync(ledgerPath) && !existsSync(contractPath)) {
		throw new RefusedRun(
			`no run ${runId}: it has neither a ledger nor a run contract`,
		);
	}

	const gaps: Array<{ piece: string; line: string }> = [];
	const gap = (piece: string, reason: string): string => {
		const line = `MISSING: ${piece}: ${reason}`;
		gaps.push({ piece, line });
		return line;
	};
	const withheld = (piece: string, source: string): string =>
		gap(piece, `${WITHHELD}; read it in ${source}`);
	const guard = (
		value: string,
		piece: string,
		source: string,
	): { text: string; withheld: boolean } =>
		suspicious(inline(value))
			? { text: withheld(piece, source), withheld: true }
			: { text: inline(value), withheld: false };
	const labelled = (
		label: string,
		value: string,
		piece: string,
		source: string,
	) => {
		const checked = guard(value, piece, source);
		return checked.withheld
			? [`${label}:`, checked.text]
			: [`${label}: ${checked.text}`];
	};
	const bullet = (value: string, piece: string, source: string) => {
		const checked = guard(value, piece, source);
		return checked.withheld ? checked.text : `- ${checked.text}`;
	};

	const ledger = existsSync(ledgerPath)
		? (() => {
				try {
					return readFileSync(ledgerPath, "utf8");
				} catch {
					return null;
				}
			})()
		: null;
	const ledgerLines = ledger === null ? [] : ledger.split("\n");

	let title = runId;
	let ids = runId;
	if (ledger !== null) {
		const titleLine = ledgerLines.find((line) => /^# \S/.test(line));
		if (titleLine) {
			const value = titleLine.slice(2).trim();
			if (suspicious(value)) withheld("title", "the ledger");
			else title = value;
		}
		const idsLine = ledgerLines.find((line) => line.startsWith("Ids:"));
		const value = idsLine?.slice(4).trim();
		if (value) {
			if (suspicious(value)) {
				withheld("ids", "the ledger");
				ids = WITHHELD;
			} else ids = value;
		}
	}

	const contractResult = readContract(contractPath);
	const contractLines: string[] = [];
	const acceptanceLines: string[] = [];
	if ("reason" in contractResult) {
		contractLines.push(gap("run contract", contractResult.reason));
		acceptanceLines.push(
			gap(
				"acceptance criteria",
				"the run contract is needed to list the criteria",
			),
		);
	} else {
		const c = contractResult.contract;
		const source = "the run contract";
		contractLines.push(
			`- Contract run id: ${c.runId}`,
			`- Plan version: ${c.planVersion}`,
			`- Level: ${c.level ?? "standard"}`,
			...labelled("Goal", c.goal, "run contract", source),
			"Scope:",
			...c.scope.map((item) => bullet(item, "run contract", source)),
			"Non-goals:",
			...(c.nonGoals.length > 0
				? c.nonGoals.map((item) => bullet(item, "run contract", source))
				: ["- None."]),
			"Tickets:",
		);
		for (const ticket of c.tickets) {
			contractLines.push(
				`- ${ticket.key} (blocked by: ${ticket.blockedBy.join(", ") || "none"})`,
				...labelled("Title", ticket.title, "run contract", source),
			);
		}
		contractLines.push(
			`Human-owned actions: ${c.humanOwned.join(", ")}`,
			`Permitted writes: ${c.permittedWrites.join(", ")}`,
		);
		if (c.supersedesHash) {
			contractLines.push(`Supersedes: ${c.supersedesHash}`);
		}
		if (c.reason) {
			contractLines.push(
				...labelled("Reason", c.reason, "run contract", source),
			);
		}
		if (c.affectedInvariant) {
			contractLines.push(
				...labelled(
					"Affected invariant",
					c.affectedInvariant,
					"run contract",
					source,
				),
			);
		}
		contractLines.push(
			`Constitution hash: ${c.constitutionHash}`,
			`Contract hash: ${c.contractHash}`,
		);
		for (const ticket of c.tickets) {
			acceptanceLines.push(`${ticket.key}:`);
			for (const criterion of ticket.acceptance) {
				acceptanceLines.push(
					bullet(criterion, `acceptance criteria for ${ticket.key}`, source),
				);
			}
		}
	}

	const keys: Keys =
		ledger === null
			? { error: "the ledger file is absent" }
			: parseKeys(ledger);
	const statusLines: string[] = [];
	const nextLines: string[] = [];
	if ("error" in keys) {
		statusLines.push(gap("current status", keys.error));
		nextLines.push(gap("next command", keys.error));
	} else {
		const rowKey = (row: KeyRow) =>
			RUN_ID.test(row.key) && !suspicious(row.key) ? row.key : `row ${row.n}`;
		for (const row of keys.rows) {
			const key = rowKey(row);
			if (suspicious(row.raw)) {
				statusLines.push(
					key,
					withheld(`current status for ${key}`, "the ledger"),
				);
				continue;
			}
			statusLines.push(
				key,
				`- Title: ${inline(row.title)}`,
				`- Stage: ${row.stage}`,
				`- Change: ${row.mr}`,
				`- Blocked by: ${row.blockedBy}`,
			);
			if (row.status === "" || row.status === "-") {
				statusLines.push(
					gap(`current status for ${key}`, "the Keys row has no status"),
				);
			} else {
				statusLines.push(`- Status: ${row.status}`);
			}
		}
		for (const row of keys.rows) {
			const key = rowKey(row);
			if (suspicious(row.raw)) {
				nextLines.push(withheld(`next command for ${key}`, "the ledger"));
			} else if (row.status === "" || row.status === "-") {
				nextLines.push(
					gap(`next command for ${key}`, "the Keys row has no status"),
				);
			} else {
				nextLines.push(...nextCommandLines(key, row.status));
			}
		}
	}

	const decisionSection =
		ledger === null ? null : sectionLines(ledger, "## Decisions");
	const decisionRaw = (decisionSection ?? []).filter((line) =>
		line.startsWith("- "),
	);
	const decisionLines: string[] = [];
	if (decisionSection === null) {
		decisionLines.push(
			gap(
				"decisions so far",
				ledger === null
					? "the ledger file is absent"
					: "the ledger has no Decisions section",
			),
		);
	} else {
		const scanned = scanLines(decisionSection, (line) => line.startsWith("- "));
		for (const line of scanned) {
			decisionLines.push(line ?? withheld("decisions so far", "the ledger"));
		}
		if (scanned.length === 0) decisionLines.push("None recorded yet.");
	}

	const changeKeys: string[] =
		"rows" in keys
			? keys.rows.map((row) => row.key).filter((key) => key !== "")
			: "contract" in contractResult
				? contractResult.contract.tickets.map((ticket) => ticket.key)
				: [];
	const changeLines: string[] = [];
	if (changeKeys.length === 0) {
		changeLines.push(
			gap("change files", "the run has no readable list of keys"),
		);
	}
	for (const key of [...new Set(changeKeys)]) {
		const piece = `change files for ${key}`;
		const found = lookupChange(key, repoRoot, stateRoot, decisionRaw);
		if ("reason" in found) {
			changeLines.push(gap(piece, found.reason), "");
			continue;
		}
		let files: Array<{ title: string; body: string }>;
		try {
			files = specSections(found.dir);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			changeLines.push(
				gap(
					piece,
					message.startsWith("no spec files")
						? "the change folder holds no Markdown file"
						: reasonText(message),
				),
				"",
			);
			continue;
		}
		changeLines.push(`Change folder for ${key}: ${found.display}`, "");
		for (const file of files) {
			const body = scanLines(file.body.split("\n"), () => true)
				.map((line) => line ?? withheld(piece, "the change file"))
				.join("\n");
			changeLines.push(`### ${file.title}`, "", fence(body), "");
		}
	}

	const packet = [
		`# Resume packet: ${title}`,
		"",
		`- Run id: ${runId}`,
		`- Known by: ${ids}`,
		"",
		LEFT_OUT_LINE,
		WITHHELD_NOTE,
		DERIVED_NOTE,
		"",
		"## Missing pieces",
		"",
		...(gaps.length > 0 ? gaps.map((entry) => entry.line) : ["None."]),
		"",
		"## Run contract",
		"",
		...contractLines,
		"",
		"## Current status",
		"",
		...statusLines,
		"",
		"## Next command",
		"",
		...nextLines,
		"",
		"## Decisions so far",
		"",
		...decisionLines,
		"",
		"## Acceptance criteria",
		"",
		...acceptanceLines,
		"",
		"## Change files",
		"",
		...changeLines,
	].join("\n");

	const path = packetPathFor(repoRoot, runId);
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, `${packet.trimEnd()}\n`);
	return { path, missing: gaps.map((entry) => entry.piece) };
}

if (import.meta.main) {
	const [mode, repoRoot, runId, ...rest] = process.argv.slice(2);
	if (
		(mode !== "build" && mode !== "where") ||
		!repoRoot ||
		!runId ||
		rest.length > 0
	) {
		console.error(USAGE);
		process.exit(2);
	}
	if (!RUN_ID.test(runId)) {
		console.error(`invalid run id: ${runId}`);
		process.exit(1);
	}
	try {
		if (mode === "where") {
			const path = packetPathFor(repoRoot, runId);
			console.log(JSON.stringify({ path, exists: existsSync(path) }));
		} else {
			console.log(JSON.stringify(buildPacket(repoRoot, runId)));
		}
	} catch (error) {
		console.error(
			error instanceof RefusedRun
				? error.message
				: `cannot write the packet for ${runId}: ${error instanceof Error ? error.message : String(error)}`,
		);
		process.exit(1);
	}
}
