import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

const ID = /^[a-z0-9][a-z0-9-]*$/i;

export function ledgerGeneration(markdown: string): number {
	const match = markdown.match(/^Generation:\s*(\d+)\s*$/m);
	if (!match) throw new Error("ledger has no valid Generation header");
	const generation = match[1];
	if (generation === undefined) throw new Error("ledger generation is missing");
	return Number.parseInt(generation, 10);
}

export function nextLedger(markdown: string, expected: number): string {
	const actual = ledgerGeneration(markdown);
	if (actual !== expected) {
		throw new Error(
			`stale ledger generation: expected ${expected}, found ${actual}`,
		);
	}
	return markdown.replace(
		/^Generation:\s*\d+\s*$/m,
		`Generation: ${actual + 1}`,
	);
}

export async function writeLedger(
	root: string,
	id: string,
	expected: number,
	markdown: string,
): Promise<void> {
	if (!ID.test(id)) throw new Error("invalid ledger id");
	const path = join(root, `${id}.md`);
	const lock = `${path}.lock`;
	await mkdir(dirname(path), { recursive: true });
	try {
		await mkdir(lock);
	} catch {
		throw new Error("ledger is being updated by another process");
	}
	try {
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
				throw new Error(
					`stale ledger generation: expected ${expected}, found ${actual}`,
				);
			}
			if (ledgerGeneration(markdown) !== expected + 1) {
				throw new Error(
					"updated ledger must increment generation exactly once",
				);
			}
		}
		const temp = `${path}.${process.pid}.tmp`;
		await writeFile(temp, markdown, { mode: 0o600 });
		await rename(temp, path);
	} finally {
		await rm(lock, { recursive: true, force: true });
	}
}

if (import.meta.main) {
	const [root, id, expectedRaw, input] = process.argv.slice(2);
	if (!root || !id || expectedRaw === undefined || !input) {
		console.error(
			"usage: ledger-store <root> <id> <expected-generation|-1> <input.md>",
		);
		process.exit(2);
	}
	try {
		await writeLedger(
			root,
			id,
			Number.parseInt(expectedRaw, 10),
			await Bun.file(input).text(),
		);
	} catch (error) {
		console.error(error instanceof Error ? error.message : String(error));
		process.exit(1);
	}
}
