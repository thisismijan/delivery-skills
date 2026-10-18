import { expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { generatePairedEvidence } from "./generate-paired-evidence";
import { evaluatePairedEvidence } from "./paired-evaluation";

async function fixture() {
	const root = await mkdtemp(join(tmpdir(), "paired-generator-"));
	for (const path of ["baseline-skill", "candidate-skill"]) {
		await mkdir(join(root, path));
	}
	await Bun.write(join(root, "baseline-skill", "SKILL.md"), "baseline");
	await Bun.write(join(root, "candidate-skill", "SKILL.md"), "candidate");
	for (const path of [
		"task.md",
		"environment.json",
		"context.md",
		"tools.json",
		"contract.md",
	]) {
		await Bun.write(join(root, path), path);
	}
	await Bun.write(join(root, "baseline-output.txt"), "baseline output");
	await Bun.write(join(root, "candidate-output.txt"), "candidate");
	await Bun.write(
		join(root, "baseline-usage.json"),
		JSON.stringify({
			source: "tokens",
			inputTokens: 100,
			outputTokens: 50,
			costUsd: 1,
			wallTimeMs: 2_000,
		}),
	);
	await Bun.write(
		join(root, "candidate-usage.json"),
		JSON.stringify({
			source: "tokens",
			inputTokens: 80,
			outputTokens: 40,
			costUsd: 0.7,
			wallTimeMs: 1_500,
		}),
	);
	const checks = [
		{ id: "contract", hidden: false, passed: true },
		{ id: "security", hidden: true, passed: true },
	];
	await Bun.write(
		join(root, "baseline-result.json"),
		JSON.stringify({
			utility: 1,
			criticalMisses: 0,
			repairAttempts: 1,
			checks,
		}),
	);
	await Bun.write(
		join(root, "candidate-result.json"),
		JSON.stringify({
			utility: 0.95,
			criticalMisses: 0,
			repairAttempts: 0,
			checks,
		}),
	);
	return root;
}

function plan() {
	return {
		version: 1 as const,
		candidateId: "improve-20261018-routing",
		intendedEffect: "behaviour" as const,
		model: "claude-opus-5.5",
		timeoutMs: 60_000,
		fixed: {
			taskFixture: "task.md",
			environment: "environment.json",
			allowedContext: ["context.md"],
			tools: "tools.json",
			outputContract: "contract.md",
		},
		hiddenChecks: { available: true as const },
		mutation: {
			required: true as const,
			id: "remove-contract",
			attempted: true as const,
			caught: true,
		},
		baseline: {
			managedTree: "baseline-skill",
			usage: "baseline-usage.json",
			result: "baseline-result.json",
			outputs: ["baseline-output.txt"],
		},
		candidate: {
			managedTree: "candidate-skill",
			usage: "candidate-usage.json",
			result: "candidate-result.json",
			outputs: ["candidate-output.txt"],
		},
	};
}

test("captured usage and gate results generate valid paired evidence", async () => {
	const root = await fixture();
	try {
		const evidence = await generatePairedEvidence(plan(), root);
		expect(evidence.baseline.controls).toEqual(evidence.candidate.controls);
		expect(evidence.baseline.managedTreeHash).not.toBe(
			evidence.candidate.managedTreeHash,
		);
		expect(evidence.baseline.metrics.usage).toEqual({
			unit: "tokens",
			input: 100,
			output: 50,
		});
		expect(evidence.candidate.metrics.deliveredCodeBytes).toBe(9);
		expect(evaluatePairedEvidence(evidence).passed).toBe(true);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("missing wall time and incomplete usage fail closed", async () => {
	const root = await fixture();
	try {
		await Bun.write(
			join(root, "candidate-usage.json"),
			JSON.stringify({ source: "tokens", inputTokens: 80 }),
		);
		await expect(generatePairedEvidence(plan(), root)).rejects.toThrow(
			"captured usage must include wall time",
		);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("the generator rejects symlinked benchmark artifacts", async () => {
	const root = await fixture();
	const outside = await mkdtemp(join(tmpdir(), "paired-generator-outside-"));
	try {
		await Bun.write(join(outside, "secret.md"), "outside");
		await symlink(
			join(outside, "secret.md"),
			join(root, "baseline-skill", "link"),
		);
		await expect(generatePairedEvidence(plan(), root)).rejects.toThrow(
			"refusing symlink artifact",
		);
	} finally {
		await rm(root, { recursive: true, force: true });
		await rm(outside, { recursive: true, force: true });
	}
});

test.each([
	["parent traversal", "../secret.md"],
	["absolute path", "/tmp/secret.md"],
	["Windows absolute path", "C:\\secret.md"],
])("the generator rejects %s", async (_label, artifactPath) => {
	const root = await fixture();
	try {
		const hostile = plan();
		hostile.fixed.taskFixture = artifactPath;
		await expect(generatePairedEvidence(hostile, root)).rejects.toThrow(
			"must stay below the plan directory",
		);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});
