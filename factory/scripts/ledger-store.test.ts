import { expect, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ledgerGeneration, nextLedger, writeLedger } from "./ledger-store";

test("ledger generation is incremented exactly once", () => {
	const current = "# Run\n\nGeneration: 2\n";
	expect(ledgerGeneration(nextLedger(current, 2))).toBe(3);
	expect(() => nextLedger(current, 1)).toThrow("stale");
});

test("stale writers cannot overwrite a newer ledger", async () => {
	const root = await mkdtemp(join(tmpdir(), "ledger-store-"));
	try {
		await writeLedger(root, "mdf-1", -1, "# Run\n\nGeneration: 0\n");
		await writeLedger(root, "mdf-1", 0, "# Run\n\nGeneration: 1\n\nfirst\n");
		await expect(
			writeLedger(root, "mdf-1", 0, "# Run\n\nGeneration: 1\n\nstale\n"),
		).rejects.toThrow("stale");
		expect(await readFile(join(root, "mdf-1.md"), "utf8")).toContain("first");
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("ledger ids cannot escape the state root", async () => {
	const root = await mkdtemp(join(tmpdir(), "ledger-store-"));
	const input = join(root, "input.md");
	await writeFile(input, "# Run\n\nGeneration: 0\n");
	try {
		await expect(
			writeLedger(root, "../escape", -1, await readFile(input, "utf8")),
		).rejects.toThrow("invalid ledger id");
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});
