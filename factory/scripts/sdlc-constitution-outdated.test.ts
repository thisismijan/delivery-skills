import { afterEach, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	OutdatedRunContractError,
	checkProposal,
	checkRunContract,
	freezeAgainstLiveConstitution,
	loadConstitution,
	parseFrozenRunContract,
	sha256Canonical,
} from "./sdlc-constitution";

const OLD_CONSTITUTION = `sha256:${"0".repeat(64)}`;
const script = join(import.meta.dir, "sdlc-constitution.ts");

function draft(overrides: Record<string, unknown> = {}) {
	const live = loadConstitution();
	return {
		version: 1,
		runId: "mdf-3212",
		planVersion: 1,
		goal: "Rerun settlement",
		scope: ["Rerun one service"],
		nonGoals: [],
		tickets: [
			{
				key: "MDF-3212",
				title: "Rerun",
				acceptance: ["It reruns"],
				blockedBy: [],
			},
		],
		permittedWrites: [...(live.document.stages.draft?.writes ?? [])],
		humanOwned: [...live.document.humanOwned],
		approval: { who: "operator", words: "yes", at: "2026-10-20T00:00:00.000Z" },
		...overrides,
	};
}

function frozenUnderOldConstitution(): Record<string, unknown> {
	const current = freezeAgainstLiveConstitution(draft());
	const { contractHash: _hash, ...body } = current;
	const old = {
		...body,
		humanOwned: [...body.humanOwned, "tracker-status"],
		constitutionHash: OLD_CONSTITUTION,
	};
	return { ...old, contractHash: sha256Canonical(old) };
}

const dirs: string[] = [];
afterEach(() => {
	for (const dir of dirs.splice(0))
		rmSync(dir, { recursive: true, force: true });
});

function write(value: unknown): string {
	const dir = mkdtempSync(join(tmpdir(), "outdated-contract-"));
	dirs.push(dir);
	const path = join(dir, "contract.json");
	writeFileSync(path, JSON.stringify(value));
	return path;
}

function cli(...args: string[]) {
	const proc = Bun.spawnSync(["bun", script, ...args], {
		stdout: "pipe",
		stderr: "pipe",
	});
	return {
		code: proc.exitCode,
		out: proc.stdout.toString(),
		err: proc.stderr.toString(),
	};
}

test("a contract naming a retired human-owned action fails with a plain way forward", () => {
	const old = frozenUnderOldConstitution();
	let caught: unknown;
	try {
		parseFrozenRunContract(old);
	} catch (error) {
		caught = error;
	}
	expect(caught).toBeInstanceOf(OutdatedRunContractError);
	const message = (caught as Error).message;
	expect(message).toMatch(/frozen under an older SDLC constitution/);
	expect(message).toContain("tracker-status");
	expect(message).toContain(String(old.contractHash));
	expect(message).toContain("scripts/sdlc-constitution.ts supersede");
});

test("check reports that plainly as JSON instead of crashing", () => {
	const result = cli(
		"check",
		write(frozenUnderOldConstitution()),
		"execute",
		"MDF-3212",
	);
	expect(result.code).toBe(1);
	expect(result.err).toBe("");
	const parsed = JSON.parse(result.out) as { ok: boolean; reason: string };
	expect(parsed.ok).toBe(false);
	expect(parsed.reason).toContain("tracker-status");
	expect(parsed.reason).toContain("supersede");
});

test("a contract frozen under another constitution names the supersede command", () => {
	const current = freezeAgainstLiveConstitution(draft());
	const { contractHash: _hash, ...body } = current;
	const moved = { ...body, constitutionHash: OLD_CONSTITUTION };
	const frozen = parseFrozenRunContract({
		...moved,
		contractHash: sha256Canonical(moved),
	});
	const result = checkRunContract({
		frozen,
		constitution: loadConstitution(),
		stage: "execute",
		ticketKey: "MDF-3212",
	});
	expect(result.ok).toBe(false);
	expect(result.reason).toMatch(/different SDLC constitution/);
	expect(result.reason).toContain("supersede");
});

test("the old contract can be superseded by a new plan version under the live constitution", () => {
	const old = frozenUnderOldConstitution();
	const proposal = freezeAgainstLiveConstitution(
		draft({
			planVersion: 2,
			supersedesHash: old.contractHash,
			reason: "the constitution changed under this run",
			affectedInvariant: "human-owned actions",
			approval: {
				who: "operator",
				words: "carry on",
				at: "2026-11-02T00:00:00.000Z",
			},
		}),
	);
	expect(checkProposal(old, proposal, loadConstitution().hash)).toEqual({
		ok: true,
	});
	expect(cli("supersede", write(old), write(proposal)).code).toBe(0);

	const unapproved = {
		...proposal,
		approval: { ...proposal.approval, at: "2026-10-20T00:00:00.000Z" },
	};
	expect(checkProposal(old, unapproved, loadConstitution().hash).ok).toBe(
		false,
	);
});

test("a tampered or malformed contract still fails as before", () => {
	const old = frozenUnderOldConstitution();
	expect(() => parseFrozenRunContract({ ...old, goal: "changed" })).toThrow(
		/hash does not match|Invalid|Expected/,
	);
	expect(() => parseFrozenRunContract({ ...old, goal: "changed" })).not.toThrow(
		OutdatedRunContractError,
	);
	expect(() => parseFrozenRunContract({ version: 1 })).toThrow();
	expect(checkProposal({ version: 1 }, {}, loadConstitution().hash).ok).toBe(
		false,
	);
});

test("the level command reports an old contract plainly too", () => {
	const result = cli("level", write(frozenUnderOldConstitution()));
	expect(result.code).toBe(1);
	expect(result.err).toBe("");
	expect(JSON.parse(result.out).reason).toContain("tracker-status");
});
