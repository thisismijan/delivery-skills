import { createHash } from "node:crypto";
import { lstat, readdir, readFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { z } from "zod";
import { PairedEvaluationEvidence } from "./paired-evaluation";
import { Usage } from "./routing-observation";

const Check = z.object({
	id: z.string().min(1),
	hidden: z.boolean(),
	passed: z.boolean(),
});

const RunResult = z.object({
	utility: z.number().positive(),
	criticalMisses: z.number().int().nonnegative(),
	repairAttempts: z.number().int().nonnegative(),
	checks: z.array(Check).min(1),
	selectedWorkerModel: z.string().min(1).optional(),
});

const RunArtifacts = z.object({
	managedTree: z.string().min(1),
	usage: z.string().min(1),
	result: z.string().min(1),
	outputs: z.array(z.string().min(1)).min(1),
});

export const PairedEvidencePlan = z.object({
	version: z.literal(1),
	candidateId: z.string().min(1),
	intendedEffect: z.enum(["behaviour", "worker-selection"]),
	model: z.string().min(1),
	timeoutMs: z.number().int().positive(),
	controllerModel: z.string().min(1).optional(),
	fixed: z.object({
		taskFixture: z.string().min(1),
		environment: z.string().min(1),
		allowedContext: z.array(z.string().min(1)).min(1),
		tools: z.string().min(1),
		outputContract: z.string().min(1),
		modelInventory: z.string().min(1).optional(),
	}),
	hiddenChecks: z.discriminatedUnion("available", [
		z.object({ available: z.literal(true) }),
		z.object({ available: z.literal(false), reason: z.string().min(1) }),
	]),
	mutation: z.discriminatedUnion("required", [
		z.object({
			required: z.literal(true),
			id: z.string().min(1),
			attempted: z.literal(true),
			caught: z.boolean(),
		}),
		z.object({
			required: z.literal(false),
			reason: z.string().min(1),
			attempted: z.boolean().optional(),
			caught: z.boolean().optional(),
		}),
	]),
	baseline: RunArtifacts,
	candidate: RunArtifacts,
});
export type PairedEvidencePlan = z.infer<typeof PairedEvidencePlan>;

async function filesUnder(path: string): Promise<string[]> {
	const info = await lstat(path);
	if (info.isSymbolicLink()) throw new Error(`refusing symlink artifact: ${path}`);
	if (info.isFile()) return [path];
	if (!info.isDirectory()) throw new Error(`artifact is not a file or directory: ${path}`);
	const entries = await readdir(path, { withFileTypes: true });
	const nested: string[] = [];
	for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
		nested.push(...(await filesUnder(resolve(path, entry.name))));
	}
	return nested;
}

export async function hashArtifacts(paths: string[]): Promise<string> {
	const hash = createHash("sha256");
	for (let index = 0; index < paths.length; index += 1) {
		const root = paths[index];
		if (!root) continue;
		for (const file of await filesUnder(root)) {
			hash.update(`${index}:${relative(root, file).replaceAll("\\", "/")}\0`);
			hash.update(await readFile(file));
			hash.update("\0");
		}
	}
	return hash.digest("hex");
}

function resolvePaths(base: string, paths: string[]): string[] {
	return paths.map((path) => resolve(base, path));
}

function comparableUsage(input: z.infer<typeof Usage>) {
	if (
		input.source === "tokens" &&
		input.inputTokens !== undefined &&
		input.outputTokens !== undefined
	) {
		return { unit: "tokens" as const, input: input.inputTokens, output: input.outputTokens };
	}
	if (
		input.source === "characters" &&
		input.inputChars !== undefined &&
		input.outputChars !== undefined
	) {
		return {
			unit: "characters" as const,
			input: input.inputChars,
			output: input.outputChars,
		};
	}
	throw new Error(
		"captured usage must contain both input and output tokens, or both character counts",
	);
}

async function outputBytes(paths: string[]): Promise<number> {
	let total = 0;
	for (const root of paths) {
		for (const file of await filesUnder(root)) {
			total += (await lstat(file)).size;
		}
	}
	return total;
}

export async function generatePairedEvidence(
	input: unknown,
	planDirectory: string,
) {
	const plan = PairedEvidencePlan.parse(input);
	const base = resolve(planDirectory);
	const fixed = plan.fixed;
	const controls = {
		taskFixtureHash: await hashArtifacts(
			resolvePaths(base, [fixed.taskFixture]),
		),
		model: plan.model,
		environmentHash: await hashArtifacts(
			resolvePaths(base, [fixed.environment]),
		),
		allowedContextHash: await hashArtifacts(
			resolvePaths(base, fixed.allowedContext),
		),
		toolsHash: await hashArtifacts(resolvePaths(base, [fixed.tools])),
		outputContractHash: await hashArtifacts(
			resolvePaths(base, [fixed.outputContract]),
		),
		timeoutMs: plan.timeoutMs,
		...(plan.controllerModel ? { controllerModel: plan.controllerModel } : {}),
		...(fixed.modelInventory
			? {
					modelInventoryHash: await hashArtifacts(
						resolvePaths(base, [fixed.modelInventory]),
					),
				}
			: {}),
	};

	const buildRun = async (artifacts: z.infer<typeof RunArtifacts>) => {
		const usage = Usage.parse(
			JSON.parse(await readFile(resolve(base, artifacts.usage), "utf8")),
		);
		if (usage.wallTimeMs === undefined) {
			throw new Error("captured usage must include wall time");
		}
		const result = RunResult.parse(
			JSON.parse(await readFile(resolve(base, artifacts.result), "utf8")),
		);
		const outputs = resolvePaths(base, artifacts.outputs);
		return {
			controls,
			managedTreeHash: await hashArtifacts([
				resolve(base, artifacts.managedTree),
			]),
			...(result.selectedWorkerModel
				? { selectedWorkerModel: result.selectedWorkerModel }
				: {}),
			utility: result.utility,
			criticalMisses: result.criticalMisses,
			checks: result.checks,
			metrics: {
				usage: comparableUsage(usage),
				...(usage.costUsd !== undefined ? { costUsd: usage.costUsd } : {}),
				wallTimeMs: usage.wallTimeMs,
				repairAttempts: result.repairAttempts,
				deliveredCodeBytes: await outputBytes(outputs),
			},
		};
	};

	return PairedEvaluationEvidence.parse({
		version: 1,
		candidateId: plan.candidateId,
		intendedEffect: plan.intendedEffect,
		baseline: await buildRun(plan.baseline),
		candidate: await buildRun(plan.candidate),
		hiddenChecks: plan.hiddenChecks,
		mutation: plan.mutation,
	});
}

if (import.meta.main) {
	const [planFile, evidenceFile] = process.argv.slice(2);
	if (!planFile || !evidenceFile) {
		console.error(
			"usage: generate-paired-evidence <paired-plan.json> <paired-evidence.json>",
		);
		process.exit(2);
	}
	try {
		const evidence = await generatePairedEvidence(
			await Bun.file(planFile).json(),
			dirname(resolve(planFile)),
		);
		await Bun.write(evidenceFile, `${JSON.stringify(evidence, null, 2)}\n`);
		console.log(JSON.stringify({ evidence: resolve(evidenceFile) }));
	} catch (error) {
		console.error(error instanceof Error ? error.message : String(error));
		process.exit(1);
	}
}
