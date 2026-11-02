import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { TEST_PATH } from "./diff-scan";
import {
	GateCommand,
	evaluateGate,
	normalizeTestPath,
	runTestGate,
} from "./test-gate";

// biome-ignore format: the workflow contract reads each invocation as one double-quoted literal
export const MUTATION_PROOF_INVOCATION =
	"scripts/mutation-proof.ts <repoRoot> <gate-command.json> <mutation.patch>";

export interface MutationProof {
	version: 1;
	head: string;
	patchSha256: string;
	mutatedFiles: string[];
	bites: boolean;
	reason: string;
	restored: true;
}

function git(cwd: string, args: string[], stdin?: string) {
	const proc = Bun.spawnSync(["git", ...args], {
		cwd,
		stdin: stdin === undefined ? "ignore" : new TextEncoder().encode(stdin),
		stdout: "pipe",
		stderr: "pipe",
	});
	return {
		code: proc.exitCode ?? 1,
		stdout: proc.stdout.toString(),
		stderr: proc.stderr.toString(),
	};
}

function patchedFiles(root: string, patch: string): string[] {
	const listed = git(root, ["apply", "--numstat", "-"], patch);
	if (listed.code !== 0) {
		throw new Error(`The mutation does not apply: ${listed.stderr.trim()}`);
	}
	return listed.stdout
		.split("\n")
		.map((line) => line.split("\t")[2]?.trim())
		.filter((path): path is string => Boolean(path));
}

// Proves a new test bites: break the behaviour it covers, see the test fail
// the way a red gate requires, then put the source back exactly as it was.
export async function proveMutation(options: {
	repoRoot: string;
	command: unknown;
	patch: string;
}): Promise<MutationProof> {
	const { repoRoot, patch } = options;
	const command = GateCommand.parse(options.command);
	if (patch.trim() === "") throw new Error("The mutation patch is empty.");
	if (git(repoRoot, ["status", "--porcelain"]).stdout.trim() !== "") {
		throw new Error(
			"Commit the new test first: the worktree must be clean before the mutation.",
		);
	}
	const files = patchedFiles(repoRoot, patch);
	if (files.length === 0) throw new Error("The mutation changes no file.");
	const tests = new Set(command.expectedTestPaths.map(normalizeTestPath));
	const touchesTest = files.filter(
		(path) => tests.has(normalizeTestPath(path)) || TEST_PATH.test(path),
	);
	if (touchesTest.length > 0) {
		throw new Error(
			`The mutation must break the behaviour, not a test: it changes ${touchesTest.join(", ")}.`,
		);
	}
	const head = git(repoRoot, ["rev-parse", "HEAD"]).stdout.trim();
	const applied = git(repoRoot, ["apply", "-"], patch);
	if (applied.code !== 0) {
		throw new Error(`The mutation does not apply: ${applied.stderr.trim()}`);
	}
	let evaluation: { ok: boolean; reason: string } | undefined;
	let failure: unknown;
	try {
		evaluation = evaluateGate(
			await runTestGate({ ...command, cwd: command.cwd ?? repoRoot }),
			"red",
		);
	} catch (error) {
		failure = error;
	}
	const reverted = git(repoRoot, ["apply", "-R", "-"], patch);
	const clean = git(repoRoot, ["status", "--porcelain"]).stdout.trim() === "";
	if (reverted.code !== 0 || !clean) {
		throw new Error(
			`The source could not be restored after the mutation; restore ${files.join(", ")} by hand before continuing.`,
		);
	}
	if (!evaluation) throw failure;
	return {
		version: 1,
		head,
		patchSha256: createHash("sha256").update(patch).digest("hex"),
		mutatedFiles: files,
		bites: evaluation.ok,
		reason: evaluation.ok
			? "The new test fails when the behaviour it covers is broken."
			: `The new test does not catch the mutation: ${evaluation.reason}`,
		restored: true,
	};
}

if (import.meta.main) {
	const [repoRoot, commandPath, patchPath] = process.argv.slice(2);
	if (!repoRoot || !commandPath || !patchPath) {
		console.error(`usage: ${MUTATION_PROOF_INVOCATION}`);
		process.exit(2);
	}
	try {
		const proof = await proveMutation({
			repoRoot,
			command: JSON.parse(readFileSync(commandPath, "utf8")),
			patch: readFileSync(patchPath, "utf8"),
		});
		console.log(JSON.stringify(proof, null, 2));
		process.exit(proof.bites ? 0 : 1);
	} catch (error) {
		console.error(error instanceof Error ? error.message : String(error));
		process.exit(1);
	}
}
