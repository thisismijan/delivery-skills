import { expect, test } from "bun:test";
import {
	mkdir,
	mkdtemp,
	readFile,
	rm,
	stat,
	writeFile,
} from "node:fs/promises";
import { hostname, tmpdir } from "node:os";
import { join } from "node:path";
import {
	ConcurrencyConflict,
	CONCURRENCY_CONFLICT_EXIT_CODE,
	ledgerGeneration,
	nextLedger,
	recoverLock,
	writeLedger,
} from "./ledger-store";

async function withRoot(run: (root: string) => Promise<void>): Promise<void> {
	const root = await mkdtemp(join(tmpdir(), "ledger-store-"));
	try {
		await run(root);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
}

function markdown(generation: number, extra = ""): string {
	return `# Run\n\nGeneration: ${generation}\n${extra}`;
}

function lockDir(root: string, id: string): string {
	return join(root, `${id}.md.lock`);
}

async function plantOwner(
	root: string,
	id: string,
	owner: { pid: number; host: string; timestamp?: string } | "unreadable",
): Promise<void> {
	const dir = lockDir(root, id);
	await mkdir(dir);
	if (owner === "unreadable") {
		await writeFile(join(dir, "owner.json"), "not-json");
		return;
	}
	await writeFile(
		join(dir, "owner.json"),
		JSON.stringify({
			pid: owner.pid,
			host: owner.host,
			timestamp: owner.timestamp ?? "2026-01-01T00:00:00.000Z",
		}),
	);
}

async function lockPresent(root: string, id: string): Promise<boolean> {
	try {
		await stat(lockDir(root, id));
		return true;
	} catch {
		return false;
	}
}

test("ledger generation is incremented exactly once", () => {
	const current = "# Run\n\nGeneration: 2\n";
	expect(ledgerGeneration(nextLedger(current, 2))).toBe(3);
	expect(() => nextLedger(current, 1)).toThrow(ConcurrencyConflict);
	expect(() => nextLedger(current, 1)).toThrow("stale");
});

test("stale writers cannot overwrite a newer ledger", async () => {
	await withRoot(async (root) => {
		await writeLedger(root, "mdf-1", -1, markdown(0));
		await writeLedger(root, "mdf-1", 0, markdown(1, "\nfirst\n"));
		try {
			await writeLedger(root, "mdf-1", 0, markdown(1, "\nstale\n"));
			throw new Error("stale write should not succeed");
		} catch (error) {
			expect(error).toBeInstanceOf(ConcurrencyConflict);
			expect((error as Error).message).toContain("stale");
		}
		expect(await readFile(join(root, "mdf-1.md"), "utf8")).toContain("first");
	});
});

test("ledger ids cannot escape the state root", async () => {
	await withRoot(async (root) => {
		const input = join(root, "input.md");
		await writeFile(input, markdown(0));
		await expect(
			writeLedger(root, "../escape", -1, await readFile(input, "utf8")),
		).rejects.toThrow("invalid ledger id");
	});
});

test("two writers on one generation keep only the winner and return a typed conflict", async () => {
	await withRoot(async (root) => {
		await writeLedger(root, "mdf-1", -1, markdown(0));
		const results = await Promise.allSettled([
			writeLedger(root, "mdf-1", 0, markdown(1, "\nwriter-a\n")),
			writeLedger(root, "mdf-1", 0, markdown(1, "\nwriter-b\n")),
		]);
		const fulfilled = results.filter((r) => r.status === "fulfilled");
		const rejected = results.filter((r) => r.status === "rejected");
		expect(fulfilled).toHaveLength(1);
		expect(rejected).toHaveLength(1);
		expect(rejected[0]?.reason).toBeInstanceOf(ConcurrencyConflict);
		const stored = await readFile(join(root, "mdf-1.md"), "utf8");
		expect(ledgerGeneration(stored)).toBe(1);
		const keptA = stored.includes("writer-a");
		const keptB = stored.includes("writer-b");
		expect(keptA || keptB).toBe(true);
		expect(keptA && keptB).toBe(false);
	});
});

test("a held lock gives a conflict and leaves the ledger unchanged", async () => {
	await withRoot(async (root) => {
		await writeLedger(root, "mdf-1", -1, markdown(0, "\noriginal\n"));
		await mkdir(lockDir(root, "mdf-1"));
		try {
			await writeLedger(root, "mdf-1", 0, markdown(1, "\nchanged\n"));
			throw new Error("write should not succeed while the lock is held");
		} catch (error) {
			expect(error).toBeInstanceOf(ConcurrencyConflict);
		}
		expect(await readFile(join(root, "mdf-1.md"), "utf8")).toContain(
			"original",
		);
		expect(ledgerGeneration(await readFile(join(root, "mdf-1.md"), "utf8"))).toBe(
			0,
		);
	});
});

test("a ledger with no Generation header is accepted as generation 0 and stamped", async () => {
	await withRoot(async (root) => {
		const legacy = "# Run\n\nIds: MDF-1\n\nlegacy body\n";
		await writeFile(join(root, "mdf-1.md"), legacy);
		expect(ledgerGeneration(legacy)).toBe(0);
		const stamped = nextLedger(legacy, 0);
		expect(ledgerGeneration(stamped)).toBe(1);
		expect(stamped).toContain("legacy body");
		expect(stamped).toContain("Ids: MDF-1");
		await writeLedger(root, "mdf-1", 0, stamped);
		const first = await readFile(join(root, "mdf-1.md"), "utf8");
		expect(first).toContain("legacy body");
		expect(ledgerGeneration(first)).toBe(1);
		await writeLedger(root, "mdf-1", 1, nextLedger(first, 1));
		const second = await readFile(join(root, "mdf-1.md"), "utf8");
		expect(ledgerGeneration(second)).toBe(2);
		expect(second).toContain("legacy body");
	});
});

test("a current-format ledger needs no conversion on first durable use", async () => {
	await withRoot(async (root) => {
		await writeFile(join(root, "mdf-1.md"), markdown(3, "\ncurrent body\n"));
		await writeLedger(root, "mdf-1", 3, markdown(4, "\ncurrent body\n"));
		const stored = await readFile(join(root, "mdf-1.md"), "utf8");
		expect(ledgerGeneration(stored)).toBe(4);
		expect(stored).toContain("current body");
	});
});

test("recovery clears a dead owner then a write succeeds, and write alone names recovery", async () => {
	await withRoot(async (root) => {
		await writeLedger(root, "mdf-1", -1, markdown(0, "\noriginal\n"));
		const owner = {
			pid: 999_001,
			host: hostname(),
			timestamp: "2026-03-04T00:00:00.000Z",
		};
		await plantOwner(root, "mdf-1", owner);
		const isAlive = () => false;
		try {
			await writeLedger(root, "mdf-1", 0, markdown(1, "\nchanged\n"), {
				isAlive,
			});
			throw new Error("write should refuse a dead owner's lock");
		} catch (error) {
			expect(error).toBeInstanceOf(ConcurrencyConflict);
			expect((error as Error).message.toLowerCase()).toContain("recover");
		}
		expect(await lockPresent(root, "mdf-1")).toBe(true);
		expect(await readFile(join(root, "mdf-1.md"), "utf8")).toContain(
			"original",
		);
		const report = await recoverLock(root, "mdf-1", { isAlive });
		expect(report.cleared).toBe(true);
		expect(report.owner?.pid).toBe(owner.pid);
		expect(report.owner?.host).toBe(owner.host);
		expect(report.reason).toContain(String(owner.pid));
		expect(await lockPresent(root, "mdf-1")).toBe(false);
		await writeLedger(root, "mdf-1", 0, markdown(1, "\nrecovered\n"));
		expect(await readFile(join(root, "mdf-1.md"), "utf8")).toContain(
			"recovered",
		);
	});
});

test("recovery leaves a live owner, a foreign host, and an unreadable owner record in place", async () => {
	await withRoot(async (root) => {
		await writeLedger(root, "live", -1, markdown(0));
		await plantOwner(root, "live", { pid: process.pid, host: hostname() });
		const live = await recoverLock(root, "live");
		expect(live.cleared).toBe(false);
		expect(live.reason.length).toBeGreaterThan(0);
		expect(await lockPresent(root, "live")).toBe(true);

		await writeLedger(root, "foreign", -1, markdown(0));
		await plantOwner(root, "foreign", {
			pid: 12,
			host: "other-host.example",
		});
		const foreign = await recoverLock(root, "foreign", { isAlive: () => false });
		expect(foreign.cleared).toBe(false);
		expect(foreign.reason.toLowerCase()).toMatch(/host/);
		expect(await lockPresent(root, "foreign")).toBe(true);

		await writeLedger(root, "broken", -1, markdown(0));
		await plantOwner(root, "broken", "unreadable");
		const broken = await recoverLock(root, "broken", { isAlive: () => false });
		expect(broken.cleared).toBe(false);
		expect(broken.reason.length).toBeGreaterThan(0);
		expect(await lockPresent(root, "broken")).toBe(true);
	});
});

test("a concurrency conflict uses a distinct command-line exit code", async () => {
	await withRoot(async (root) => {
		const input = join(root, "input.md");
		await writeLedger(root, "mdf-1", -1, markdown(0, "\nfirst\n"));
		await writeFile(input, markdown(1, "\nstale\n"));
		const script = join(import.meta.dir, "ledger-store.ts");
		const proc = Bun.spawn(["bun", script, root, "mdf-1", "0", input], {
			stdout: "pipe",
			stderr: "pipe",
		});
		const exitCode = await proc.exited;
		expect(CONCURRENCY_CONFLICT_EXIT_CODE).not.toBe(0);
		expect(CONCURRENCY_CONFLICT_EXIT_CODE).not.toBe(1);
		expect(CONCURRENCY_CONFLICT_EXIT_CODE).not.toBe(2);
		expect(exitCode).toBe(CONCURRENCY_CONFLICT_EXIT_CODE);
		expect(await readFile(join(root, "mdf-1.md"), "utf8")).toContain("first");
	});
});
