import { mkdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import {
	type CorpusEntry,
	MODEL_RUN_PROVENANCE,
	scoreCandidate,
	writeCorpus,
} from "./evaluation-corpus";
import { MIN_EVALUATED_FAST_SAMPLES, evaluatePromotion } from "./fast-dispatch";
import {
	PairedEvidencePlan,
	generatePairedEvidence,
} from "./generate-paired-evidence";
import {
	representativeUnscriptedMechanicalObservations,
	unscriptedMechanicalFixtures,
} from "./mechanical-edit-scoring";
import { materializeUnscriptedMechanicalRepos } from "./mechanical-edit-test-repos";
import {
	fastCatalogueCandidateIds,
	loadModelCatalogue,
	requireFastCatalogueCandidate,
} from "./model-catalogue";
import { evaluatePairedEvidence } from "./paired-evaluation";
import { Usage } from "./routing-observation";

export { MODEL_RUN_PROVENANCE };

const PLACEHOLDER_PREFIX = "Replace this file";
const STAND_IN_MARK = "test-repo stand-in";

const DEFAULT_PLAN = {
	version: 1 as const,
	intendedEffect: "behaviour" as const,
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
		id: "revert-one-identifier",
		attempted: true as const,
		caught: true,
	},
	baseline: {
		managedTree: "baseline-skill",
		usage: "baseline-usage.json",
		result: "baseline-result.json",
		outputs: ["baseline-output"],
	},
	candidate: {
		managedTree: "candidate-skill",
		usage: "candidate-usage.json",
		result: "candidate-result.json",
		outputs: ["candidate-output"],
	},
};

const RunResult = {
	parse(input: unknown): {
		utility: number;
		criticalMisses: number;
		repairAttempts: number;
		checks: Array<{ id: string; hidden: boolean; passed: boolean }>;
		selectedWorkerModel?: string;
	} {
		if (input === null || typeof input !== "object") {
			throw new Error("run result must be an object");
		}
		const raw = input as Record<string, unknown>;
		if (
			typeof raw.selectedWorkerModel !== "string" ||
			!raw.selectedWorkerModel
		) {
			throw new Error("run result must name selectedWorkerModel");
		}
		const checks = raw.checks;
		if (!Array.isArray(checks) || checks.length === 0) {
			throw new Error("run result must include checks");
		}
		return {
			utility: Number(raw.utility),
			criticalMisses: Number(raw.criticalMisses),
			repairAttempts: Number(raw.repairAttempts),
			checks: checks as Array<{
				id: string;
				hidden: boolean;
				passed: boolean;
			}>,
			selectedWorkerModel: raw.selectedWorkerModel,
		};
	},
};

async function readJson(path: string): Promise<unknown> {
	if (!(await Bun.file(path).exists())) {
		throw new Error(`missing ${path}`);
	}
	return Bun.file(path).json();
}

async function writeJson(path: string, value: unknown): Promise<void> {
	await mkdir(dirname(path), { recursive: true });
	await Bun.write(path, `${JSON.stringify(value, null, 2)}\n`);
}

function captureDir(root: string, fixtureId: string): string {
	return join(root, "captures", fixtureId);
}

async function assertTokenUsage(path: string, label: string): Promise<void> {
	const usage = Usage.parse(await readJson(path));
	if (usage.source !== "tokens") {
		throw new Error(
			`${label} usage must be host tokens; character counts are not a model run`,
		);
	}
	if (usage.inputTokens === undefined || usage.outputTokens === undefined) {
		throw new Error(`${label} usage must include input and output tokens`);
	}
	if (usage.wallTimeMs === undefined) {
		throw new Error(`${label} usage must include wall time`);
	}
}

async function assertNotPlaceholder(
	path: string,
	label: string,
): Promise<void> {
	if (!(await Bun.file(path).exists())) {
		throw new Error(`missing ${label}`);
	}
	const text = await Bun.file(path).text();
	if (text.startsWith(PLACEHOLDER_PREFIX) || text.includes(STAND_IN_MARK)) {
		throw new Error(
			`${label} is a placeholder or test-repo stand-in, not a captured model tree`,
		);
	}
}

async function loadPlan(
	dir: string,
	fixtureId: string,
	candidateModel: string,
): Promise<PairedEvidencePlan> {
	const planPath = join(dir, "paired-plan.json");
	const raw = (await Bun.file(planPath).exists())
		? await readJson(planPath)
		: undefined;
	if (
		raw !== undefined &&
		typeof raw === "object" &&
		raw !== null &&
		"hiddenChecks" in raw &&
		(raw as { hiddenChecks?: { available?: boolean } }).hiddenChecks
			?.available === false
	) {
		throw new Error(`${fixtureId} must include hidden checks`);
	}
	return PairedEvidencePlan.parse({
		...DEFAULT_PLAN,
		...(raw && typeof raw === "object" ? raw : {}),
		candidateId: `${candidateModel}-${fixtureId}`,
		model: candidateModel,
		hiddenChecks: { available: true },
	});
}

export async function prepareUnscriptedMechanicalModelRuns(
	workDir: string,
): Promise<{ workDir: string; repos: string[]; captures: string[] }> {
	const root = resolve(workDir);
	await mkdir(root, { recursive: true });
	const repos = await materializeUnscriptedMechanicalRepos(join(root, "repos"));
	const captures: string[] = [];
	for (const fixture of unscriptedMechanicalFixtures()) {
		const dir = captureDir(root, fixture.id);
		await mkdir(join(dir, "baseline-output"), { recursive: true });
		await mkdir(join(dir, "candidate-output"), { recursive: true });
		await Bun.write(
			join(dir, "task.md"),
			`${fixture.reason}\n\n${JSON.stringify(fixture.payload, null, 2)}\n`,
		);
		await writeJson(join(dir, "environment.json"), {
			kind: "model-run",
			fixture: fixture.id,
		});
		await Bun.write(
			join(dir, "context.md"),
			"Listed fixture files in the sibling git repository. Do not include expected trees or check answers.\n",
		);
		await Bun.write(join(dir, "tools.json"), '{"tools":["git"]}\n');
		await Bun.write(
			join(dir, "contract.md"),
			"Apply a classified rename, import-only, or format-only unit without changing behaviour.\n",
		);
		await Bun.write(
			join(dir, "baseline-skill", "SKILL.md"),
			`${PLACEHOLDER_PREFIX} with the live standard worker managed tree.\n`,
		);
		await Bun.write(
			join(dir, "candidate-skill", "SKILL.md"),
			`${PLACEHOLDER_PREFIX} with the evaluation-only candidate managed tree.\n`,
		);
		captures.push(dir);
	}
	await Bun.write(
		join(root, "CAPTURE.md"),
		[
			"# Mechanical-edit model-run capture",
			"",
			"Dispatch the live standard worker and the named fast catalogue model (`model-catalogue.ts resolve fast <inventory> --evaluation`) on each `repos/<id>` git fixture. Do not live-dispatch a fast model.",
			"",
			"For each `captures/<id>` drop:",
			"",
			"- `baseline-skill/` and `candidate-skill/` managed trees",
			"- `baseline-output/` and `candidate-output/` delivered files",
			"- `baseline-usage.json` and `candidate-usage.json` from `capture-usage.ts` with host tokens and wall time",
			"- `baseline-result.json` and `candidate-result.json` with `selectedWorkerModel`, utility, critical misses, and at least one hidden check",
			"",
			"Then run ingest. Character-only usage and the local stand-in rewrite are refused.",
			"",
		].join("\n"),
	);
	return { workDir: root, repos, captures };
}

export async function ingestUnscriptedMechanicalModelRuns(input: {
	captureDir: string;
	candidateModel: string;
}): Promise<{
	corpusDir: string;
	entries: CorpusEntry[];
	sampleSize: number;
	availability: "live" | "evaluation-only";
}> {
	const root = resolve(input.captureDir);
	const candidateModel = requireFastCatalogueCandidate(
		await loadModelCatalogue(),
		input.candidateModel,
	);
	const fixtures = unscriptedMechanicalFixtures();
	const observations =
		representativeUnscriptedMechanicalObservations("representative-run");
	const entries: CorpusEntry[] = [];

	for (let index = 0; index < fixtures.length; index += 1) {
		const fixture = fixtures[index];
		const observation = observations[index];
		if (!fixture || !observation) {
			continue;
		}
		const dir = captureDir(root, fixture.id);
		const baselineUsage = join(dir, "baseline-usage.json");
		const candidateUsage = join(dir, "candidate-usage.json");
		const hasBaselineUsage = await Bun.file(baselineUsage).exists();
		const hasCandidateUsage = await Bun.file(candidateUsage).exists();
		if (!hasBaselineUsage && !hasCandidateUsage) {
			continue;
		}
		const plan = await loadPlan(dir, fixture.id, candidateModel);
		await assertTokenUsage(
			join(dir, plan.baseline.usage),
			`${fixture.id} baseline`,
		);
		await assertTokenUsage(
			join(dir, plan.candidate.usage),
			`${fixture.id} candidate`,
		);
		await assertNotPlaceholder(
			join(dir, plan.baseline.managedTree, "SKILL.md"),
			`${fixture.id} baseline skill`,
		);
		await assertNotPlaceholder(
			join(dir, plan.candidate.managedTree, "SKILL.md"),
			`${fixture.id} candidate skill`,
		);
		const baselineResult = RunResult.parse(
			await readJson(join(dir, plan.baseline.result)),
		);
		const candidateResult = RunResult.parse(
			await readJson(join(dir, plan.candidate.result)),
		);
		if (candidateResult.selectedWorkerModel !== candidateModel) {
			throw new Error(
				`${fixture.id} candidate worker must be ${candidateModel}`,
			);
		}
		if (baselineResult.selectedWorkerModel === candidateModel) {
			throw new Error(
				`${fixture.id} baseline worker must not be ${candidateModel}`,
			);
		}
		if (!candidateResult.checks.some((check) => check.hidden)) {
			throw new Error(`${fixture.id} must include a hidden check`);
		}
		const evidence = await generatePairedEvidence(plan, dir);
		const paired = evaluatePairedEvidence(evidence);
		await writeJson(join(root, "evidence", `${fixture.id}.json`), evidence);
		entries.push(
			scoreCandidate(observation, {
				candidateModel,
				relativeUtility: Math.min(1, paired.relativeUtility),
				criticalMisses: paired.criticalMisses,
				provenance: MODEL_RUN_PROVENANCE,
			}),
		);
	}

	if (entries.length === 0) {
		throw new Error("no complete model-run captures");
	}
	const corpusDir = join(root, "corpus");
	await writeCorpus(corpusDir, entries);
	const verdict = evaluatePromotion(entries, candidateModel);
	return {
		corpusDir,
		entries,
		sampleSize: verdict.sampleSize,
		availability: verdict.availability,
	};
}

if (import.meta.main) {
	const [command, dir, candidateModel] = process.argv.slice(2);
	if (
		!command ||
		!dir ||
		(command !== "prepare" && command !== "ingest") ||
		(command === "ingest" && !candidateModel)
	) {
		console.error(
			"usage: mechanical-edit-model-runs prepare <directory>\n       mechanical-edit-model-runs ingest <directory> <fast-candidate>",
		);
		process.exit(2);
	}
	try {
		const fastCandidates = fastCatalogueCandidateIds(
			await loadModelCatalogue(),
		);
		if (command === "prepare") {
			const prepared = await prepareUnscriptedMechanicalModelRuns(dir);
			console.log(
				JSON.stringify({
					workDir: prepared.workDir,
					repos: prepared.repos.length,
					captures: prepared.captures.length,
					fastCandidates,
				}),
			);
		} else {
			if (!candidateModel) {
				process.exit(2);
			}
			const ingested = await ingestUnscriptedMechanicalModelRuns({
				captureDir: dir,
				candidateModel,
			});
			console.log(
				JSON.stringify({
					candidate: candidateModel,
					provenance: MODEL_RUN_PROVENANCE,
					count: ingested.entries.length,
					sampleSize: ingested.sampleSize,
					availability: ingested.availability,
					need: MIN_EVALUATED_FAST_SAMPLES,
					corpus: ingested.corpusDir,
					fastCandidates,
				}),
			);
		}
	} catch (error) {
		console.error(error instanceof Error ? error.message : String(error));
		process.exit(1);
	}
}
