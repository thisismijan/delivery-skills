import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { hostname } from "node:os";
import { basename, dirname, isAbsolute, join } from "node:path";

const ID = /^[a-z0-9][a-z0-9-]*$/i;
const OWNER_FILE = "owner.json";

// biome-ignore format: the workflow contract reads each invocation as one double-quoted literal
export const LEDGER_WRITE_INVOCATION = "scripts/ledger-store.ts <root> <id> <expected-generation|-1> <input.md>";
// biome-ignore format: the workflow contract reads each invocation as one double-quoted literal
export const LEDGER_RECOVER_INVOCATION = "scripts/ledger-store.ts recover <root> <id>";
export const LEDGER_TIME_FORMAT = "yyyy-mm-ddThh:mm:ssZ";
export const CONCURRENCY_CONFLICT_EXIT_CODE = 4;

const LEDGER_TIME_SHAPE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;
const LEDGER_TIME_EXAMPLE = "2026-11-09T13:34:05Z";
const TIMED_BULLET = /^- (\S+)(?: |$)/;
const ENTRY_SECTIONS = [
	{ name: "Stops", heading: "## stops" },
	{ name: "Approvals", heading: "## approvals" },
] as const;

export function isLedgerTime(text: string): boolean {
	if (!LEDGER_TIME_SHAPE.test(text)) return false;
	const instant = new Date(text);
	if (Number.isNaN(instant.getTime())) return false;
	return instant.toISOString().replace(".000Z", "Z") === text;
}

export function sectionEntries(markdown: string, heading: string): string[] {
	const entries: string[] = [];
	let inside = false;
	for (const line of markdown.split(/\r?\n/)) {
		if (line.trim().toLowerCase() === heading) {
			inside = true;
		} else if (line.startsWith("## ")) {
			inside = false;
		} else if (inside && line.trim() !== "") {
			entries.push(line.trim());
		}
	}
	return entries;
}

export function ledgerEntryLines(
	markdown: string,
	section: "Stops" | "Approvals" | "Decisions",
): string[] {
	return sectionEntries(markdown, `## ${section.toLowerCase()}`);
}

export function ledgerLineTime(line: string): string | undefined {
	const time = TIMED_BULLET.exec(line.trim())?.[1];
	return time !== undefined && isLedgerTime(time) ? time : undefined;
}

function hasSection(markdown: string, heading: string): boolean {
	return markdown
		.split(/\r?\n/)
		.some((line) => line.trim().toLowerCase() === heading);
}

function unmatched(lines: string[], against: string[]): string[] {
	const available = new Map<string, number>();
	for (const line of against) {
		available.set(line, (available.get(line) ?? 0) + 1);
	}
	return lines.filter((line) => {
		const count = available.get(line) ?? 0;
		if (count === 0) return true;
		available.set(line, count - 1);
		return false;
	});
}

export function ledgerEntryProblems(previous: string, next: string): string[] {
	const form = `a UTC time written as ${LEDGER_TIME_FORMAT}, for example ${LEDGER_TIME_EXAMPLE}.`;
	const lost: string[] = [];
	const added: string[] = [];
	const lostSections: string[] = [];
	for (const { name, heading } of ENTRY_SECTIONS) {
		if (hasSection(previous, heading) && !hasSection(next, heading)) {
			lostSections.push(
				`ledger lost its ${name} section; every section is kept.`,
			);
			continue;
		}
		const before = sectionEntries(previous, heading);
		const after = sectionEntries(next, heading);
		for (const line of unmatched(before, after)) {
			lost.push(
				`ledger ${name} section lost an older line: "${line}". Older lines are kept exactly as written; new lines start with ${form}`,
			);
		}
		for (const line of unmatched(after, before)) {
			if (ledgerLineTime(line) !== undefined) continue;
			added.push(
				`ledger ${name} line has no UTC time: "${line}". Start new Stops and Approvals lines with ${form}`,
			);
		}
	}
	return [...lostSections, ...lost, ...added];
}

export class ConcurrencyConflict extends Error {
	constructor(message: string) {
		super(message);
		this.name = "ConcurrencyConflict";
	}
}

export interface LockOwner {
	pid: number;
	host: string;
	timestamp: string;
}

export interface RecoverLockReport {
	cleared: boolean;
	reason: string;
	owner?: LockOwner;
}

export interface LedgerLockOptions {
	isAlive?: (pid: number) => boolean;
}

export interface LedgerTarget {
	root: string;
	id: string;
	workerJournal: boolean;
}

export function ledgerTarget(
	root: string,
	id: string,
	journalPath = process.env.DELIVERY_WORKER_JOURNAL,
): LedgerTarget {
	if (!journalPath) return { root, id, workerJournal: false };
	if (!isAbsolute(journalPath) || !journalPath.endsWith(".md")) {
		throw new Error("DELIVERY_WORKER_JOURNAL must be an absolute .md path");
	}
	const journalId = basename(journalPath, ".md");
	if (!ID.test(journalId)) {
		throw new Error("DELIVERY_WORKER_JOURNAL must have a file-safe name");
	}
	return {
		root: dirname(journalPath),
		id: journalId,
		workerJournal: true,
	};
}

export function ledgerGeneration(markdown: string): number {
	const match = markdown.match(/^Generation:\s*(\d+)\s*$/m);
	if (!match) return 0;
	const generation = match[1];
	if (generation === undefined) return 0;
	return Number.parseInt(generation, 10);
}

function stampGeneration(markdown: string, generation: number): string {
	const header = `Generation: ${generation}`;
	if (/^Generation:\s*\d+\s*$/m.test(markdown)) {
		return markdown.replace(/^Generation:\s*\d+\s*$/m, header);
	}
	const nl = markdown.indexOf("\n");
	if (nl === -1) return `${markdown}\n\n${header}\n`;
	return `${markdown.slice(0, nl + 1)}\n${header}\n${markdown.slice(nl + 1)}`;
}

export function nextLedger(markdown: string, expected: number): string {
	const actual = ledgerGeneration(markdown);
	if (actual !== expected) {
		throw new ConcurrencyConflict(
			`stale ledger generation: expected ${expected}, found ${actual}`,
		);
	}
	return stampGeneration(markdown, actual + 1);
}

function processIsAlive(pid: number): boolean {
	try {
		process.kill(pid, 0);
		return true;
	} catch (error) {
		const code =
			error instanceof Error && "code" in error ? error.code : undefined;
		return code === "EPERM";
	}
}

function lockPath(root: string, id: string): string {
	return join(root, `${id}.md.lock`);
}

async function pathExists(path: string): Promise<boolean> {
	try {
		await stat(path);
		return true;
	} catch {
		return false;
	}
}

async function readOwner(lock: string): Promise<LockOwner | undefined> {
	try {
		const parsed = JSON.parse(
			await readFile(join(lock, OWNER_FILE), "utf8"),
		) as {
			pid?: unknown;
			host?: unknown;
			timestamp?: unknown;
		};
		if (
			typeof parsed.pid !== "number" ||
			typeof parsed.host !== "string" ||
			typeof parsed.timestamp !== "string"
		) {
			return undefined;
		}
		return { pid: parsed.pid, host: parsed.host, timestamp: parsed.timestamp };
	} catch {
		return undefined;
	}
}

async function lockConflict(
	lock: string,
	options?: LedgerLockOptions,
): Promise<ConcurrencyConflict> {
	const owner = await readOwner(lock);
	if (!owner) {
		return new ConcurrencyConflict("ledger is locked by another writer");
	}
	const alive = (options?.isAlive ?? processIsAlive)(owner.pid);
	if (owner.host === hostname() && !alive) {
		return new ConcurrencyConflict(
			`ledger is locked by inactive owner pid ${owner.pid} on ${owner.host}; run recover`,
		);
	}
	return new ConcurrencyConflict(
		`ledger is locked by pid ${owner.pid} on ${owner.host}`,
	);
}

export async function recoverLock(
	root: string,
	id: string,
	options?: LedgerLockOptions,
): Promise<RecoverLockReport> {
	if (!ID.test(id)) throw new Error("invalid ledger id");
	const lock = lockPath(root, id);
	if (!(await pathExists(lock))) {
		return { cleared: false, reason: "no lock" };
	}
	const owner = await readOwner(lock);
	if (!owner) {
		return { cleared: false, reason: "owner record is unreadable" };
	}
	if (owner.host !== hostname()) {
		return {
			cleared: false,
			reason: `owner host ${owner.host} cannot be checked from ${hostname()}`,
			owner,
		};
	}
	if ((options?.isAlive ?? processIsAlive)(owner.pid)) {
		return {
			cleared: false,
			reason: `owner pid ${owner.pid} is still active on ${owner.host}`,
			owner,
		};
	}
	await rm(lock, { recursive: true, force: true });
	return {
		cleared: true,
		reason: `cleared lock owned by pid ${owner.pid} on ${owner.host}`,
		owner,
	};
}

export async function writeLedger(
	root: string,
	id: string,
	expected: number,
	markdown: string,
	options?: LedgerLockOptions,
): Promise<void> {
	if (!ID.test(id)) throw new Error("invalid ledger id");
	const path = join(root, `${id}.md`);
	const lock = `${path}.lock`;
	await mkdir(dirname(path), { recursive: true });
	try {
		await mkdir(lock);
	} catch (error) {
		if (await pathExists(lock)) throw await lockConflict(lock, options);
		throw error;
	}
	try {
		await writeFile(
			join(lock, OWNER_FILE),
			JSON.stringify({
				pid: process.pid,
				host: hostname(),
				timestamp: new Date().toISOString(),
			}),
		);
		let current = "";
		try {
			current = await readFile(path, "utf8");
		} catch {
			if (expected !== -1) throw new Error("ledger does not exist");
		}
		if (expected === -1) {
			if (current) throw new Error("ledger already exists");
			if (ledgerGeneration(markdown) !== 0) {
				throw new Error("a new ledger must start at generation 0");
			}
		} else {
			const actual = ledgerGeneration(current);
			if (actual !== expected) {
				throw new ConcurrencyConflict(
					`stale ledger generation: expected ${expected}, found ${actual}`,
				);
			}
			if (ledgerGeneration(markdown) !== expected + 1) {
				throw new Error(
					"updated ledger must increment generation exactly once",
				);
			}
		}
		const problems = ledgerEntryProblems(current, markdown);
		if (problems.length > 0) throw new Error(problems.join("\n"));
		const temp = `${path}.${process.pid}.tmp`;
		await writeFile(temp, markdown, { mode: 0o600 });
		await rename(temp, path);
	} finally {
		await rm(lock, { recursive: true, force: true });
	}
}

if (import.meta.main) {
	const args = process.argv.slice(2);
	try {
		if (args[0] === "recover") {
			const root = args[1];
			const id = args[2];
			if (!root || !id || args.length !== 3) {
				console.error(`usage: ${LEDGER_RECOVER_INVOCATION}`);
				process.exit(2);
			}
			const target = ledgerTarget(root, id);
			console.log(JSON.stringify(await recoverLock(target.root, target.id)));
			process.exit(0);
		}
		const [root, id, expectedRaw, input] = args;
		if (!root || !id || expectedRaw === undefined || !input) {
			console.error(`usage: ${LEDGER_WRITE_INVOCATION}`);
			process.exit(2);
		}
		const target = ledgerTarget(root, id);
		await writeLedger(
			target.root,
			target.id,
			Number.parseInt(expectedRaw, 10),
			await Bun.file(input).text(),
		);
	} catch (error) {
		console.error(error instanceof Error ? error.message : String(error));
		process.exit(
			error instanceof ConcurrencyConflict ? CONCURRENCY_CONFLICT_EXIT_CODE : 1,
		);
	}
}
