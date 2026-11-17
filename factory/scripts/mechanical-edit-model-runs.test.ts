import { expect, test } from "bun:test";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MODEL_RUN_PROVENANCE } from "./evaluation-corpus";
import {
	MIN_EVALUATED_FAST_SAMPLES,
	applyFastPromotion,
	evaluatePromotion,
} from "./fast-dispatch";
import {
	ingestUnscriptedMechanicalModelRuns,
	prepareUnscriptedMechanicalModelRuns,
} from "./mechanical-edit-model-runs";
import { unscriptedMechanicalFixtures } from "./mechanical-edit-scoring";
import {
	fastCatalogueCandidateIds,
	loadModelCatalogue,
} from "./model-catalogue";

const SPARK = "muse-spark-1.3-medium";
const COMPOSER = "composer-1";

const checks = [
	{ id: "compile", hidden: false, passed: true },
	{ id: "completeness", hidden: true, passed: true },
];

async function writeJson(path: string, value: unknown): Promise<void> {
	await mkdir(join(path, ".."), { recursive: true }).catch(() => undefined);
	await Bun.write(path, `${JSON.stringify(value, null, 2)}\n`);
}

async function fillCapture(
	root: string,
	fixtureId: string,
	options?: {
		usageSource?: "tokens" | "characters";
		candidateWorker?: string | null;
		candidateSkill?: string;
		baselineWorker?: string;
	},
): Promise<void> {
	const dir = join(root, "captures", fixtureId);
	await Bun.write(join(dir, "baseline-skill", "SKILL.md"), "standard worker\n");
	await Bun.write(
		join(dir, "candidate-skill", "SKILL.md"),
		options?.candidateSkill ?? "fast worker\n",
	);
	await Bun.write(join(dir, "baseline-output", "out.txt"), "baseline\n");
	await Bun.write(join(dir, "candidate-output", "out.txt"), "candidate\n");
	const usage =
		options?.usageSource === "characters"
			? {
					source: "characters",
					inputChars: 10,
					outputChars: 8,
					wallTimeMs: 20,
				}
			: {
					source: "tokens",
					inputTokens: 100,
					outputTokens: 40,
					wallTimeMs: 20,
				};
	await writeJson(join(dir, "baseline-usage.json"), usage);
	await writeJson(join(dir, "candidate-usage.json"), usage);
	await writeJson(join(dir, "baseline-result.json"), {
		utility: 1,
		criticalMisses: 0,
		repairAttempts: 0,
		checks,
		selectedWorkerModel: options?.baselineWorker ?? "sonnet",
	});
	const candidateResult: Record<string, unknown> = {
		utility: 0.95,
		criticalMisses: 0,
		repairAttempts: 0,
		checks,
	};
	if (options?.candidateWorker !== null) {
		candidateResult.selectedWorkerModel = options?.candidateWorker ?? SPARK;
	}
	await writeJson(join(dir, "candidate-result.json"), candidateResult);
}

test("prepare materializes git fixtures and capture skeletons", async () => {
	const workDir = await mkdtemp(join(tmpdir(), "mechanical-edit-prepare-"));
	try {
		const prepared = await prepareUnscriptedMechanicalModelRuns(workDir);
		expect(prepared.captures.length).toBe(
			unscriptedMechanicalFixtures().length,
		);
		for (const fixture of unscriptedMechanicalFixtures()) {
			expect(
				await Bun.file(
					join(workDir, "repos", fixture.id, ".git", "HEAD"),
				).exists(),
			).toBe(true);
			expect(
				await Bun.file(
					join(workDir, "captures", fixture.id, "task.md"),
				).exists(),
			).toBe(true);
		}
		const capture = await Bun.file(join(workDir, "CAPTURE.md")).text();
		expect(capture).toMatch(
			/prove the host accepts that exact id as a dispatchable model/i,
		);
		expect(capture).toMatch(
			/Listing it in the inventory, or resolving it with `--evaluation`, is not a run/,
		);
		expect(capture).toMatch(/If the host refuses the id, stop/i);
		expect(capture).toMatch(/Do not invent token counts/i);
		for (const fixture of unscriptedMechanicalFixtures()) {
			expect(capture).toContain(`- \`${fixture.id}\``);
		}
	} finally {
		await rm(workDir, { recursive: true, force: true });
	}
});

test("ingest refuses character-only usage", async () => {
	const workDir = await mkdtemp(join(tmpdir(), "mechanical-edit-chars-"));
	try {
		await prepareUnscriptedMechanicalModelRuns(workDir);
		const fixture = unscriptedMechanicalFixtures()[0];
		if (!fixture) throw new Error("missing fixture");
		await fillCapture(workDir, fixture.id, { usageSource: "characters" });
		await expect(
			ingestUnscriptedMechanicalModelRuns({
				captureDir: workDir,
				candidateModel: SPARK,
			}),
		).rejects.toThrow(/host tokens/);
		expect(await Bun.file(join(workDir, "corpus", "index.json")).exists()).toBe(
			false,
		);
	} finally {
		await rm(workDir, { recursive: true, force: true });
	}
});

test("ingest refuses a test-repo stand-in rewrite", async () => {
	const workDir = await mkdtemp(join(tmpdir(), "mechanical-edit-stand-in-"));
	try {
		await prepareUnscriptedMechanicalModelRuns(workDir);
		const fixture = unscriptedMechanicalFixtures()[0];
		if (!fixture) throw new Error("missing fixture");
		await fillCapture(workDir, fixture.id, {
			candidateSkill: "test-repo stand-in rewrite\n",
		});
		await expect(
			ingestUnscriptedMechanicalModelRuns({
				captureDir: workDir,
				candidateModel: SPARK,
			}),
		).rejects.toThrow(/stand-in/);
	} finally {
		await rm(workDir, { recursive: true, force: true });
	}
});

test("ingest refuses a missing candidate worker name", async () => {
	const workDir = await mkdtemp(join(tmpdir(), "mechanical-edit-worker-"));
	try {
		await prepareUnscriptedMechanicalModelRuns(workDir);
		const fixture = unscriptedMechanicalFixtures()[0];
		if (!fixture) throw new Error("missing fixture");
		await fillCapture(workDir, fixture.id, { candidateWorker: null });
		await expect(
			ingestUnscriptedMechanicalModelRuns({
				captureDir: workDir,
				candidateModel: SPARK,
			}),
		).rejects.toThrow(/selectedWorkerModel/);
	} finally {
		await rm(workDir, { recursive: true, force: true });
	}
});

test("a complete capture is scored as a model run and does not promote", async () => {
	const workDir = await mkdtemp(join(tmpdir(), "mechanical-edit-ingest-"));
	const catalogue = await loadModelCatalogue();
	const before = structuredClone(catalogue);
	try {
		await prepareUnscriptedMechanicalModelRuns(workDir);
		for (const fixture of unscriptedMechanicalFixtures()) {
			await fillCapture(workDir, fixture.id, { candidateWorker: SPARK });
		}
		const ingested = await ingestUnscriptedMechanicalModelRuns({
			captureDir: workDir,
			candidateModel: SPARK,
		});
		expect(ingested.entries.length).toBeGreaterThanOrEqual(
			MIN_EVALUATED_FAST_SAMPLES,
		);
		expect(
			ingested.entries.every(
				(entry) =>
					entry.evaluation?.provenance === MODEL_RUN_PROVENANCE &&
					entry.evaluation.candidateModel === SPARK &&
					entry.observation.source === "representative-run",
			),
		).toBe(true);
		expect(ingested.sampleSize).toBeGreaterThanOrEqual(
			MIN_EVALUATED_FAST_SAMPLES,
		);
		expect(ingested.availability).toBe("evaluation-only");
		const verdict = evaluatePromotion(ingested.entries, SPARK);
		expect(verdict.evidenceCleared).toBe(true);
		expect(verdict.availability).toBe("evaluation-only");
		expect(applyFastPromotion(catalogue, verdict)).toEqual(before);
		expect(catalogue).toEqual(before);
	} finally {
		await rm(workDir, { recursive: true, force: true });
	}
});

test("ingest refuses a model that is not in the fast catalogue tier", async () => {
	const workDir = await mkdtemp(join(tmpdir(), "mechanical-edit-standard-"));
	try {
		await prepareUnscriptedMechanicalModelRuns(workDir);
		const fixture = unscriptedMechanicalFixtures()[0];
		if (!fixture) throw new Error("missing fixture");
		await fillCapture(workDir, fixture.id, { candidateWorker: "sonnet" });
		await expect(
			ingestUnscriptedMechanicalModelRuns({
				captureDir: workDir,
				candidateModel: "sonnet",
			}),
		).rejects.toThrow(/not a fast catalogue model/);
		expect(await Bun.file(join(workDir, "corpus", "index.json")).exists()).toBe(
			false,
		);
	} finally {
		await rm(workDir, { recursive: true, force: true });
	}
});

test("the CLI prepare and ingest round-trip", async () => {
	const workDir = await mkdtemp(join(tmpdir(), "mechanical-edit-cli-runs-"));
	try {
		const prepared = Bun.spawn(
			[
				"bun",
				join(import.meta.dir, "mechanical-edit-model-runs.ts"),
				"prepare",
				workDir,
			],
			{ stdout: "pipe", stderr: "pipe" },
		);
		expect(await prepared.exited).toBe(0);
		expect(
			JSON.parse(await new Response(prepared.stdout).text()).fastCandidates,
		).toEqual(fastCatalogueCandidateIds(await loadModelCatalogue()));
		for (const fixture of unscriptedMechanicalFixtures()) {
			await fillCapture(workDir, fixture.id, { candidateWorker: COMPOSER });
		}
		const ingested = Bun.spawn(
			[
				"bun",
				join(import.meta.dir, "mechanical-edit-model-runs.ts"),
				"ingest",
				workDir,
				COMPOSER,
			],
			{ stdout: "pipe", stderr: "pipe" },
		);
		expect(await ingested.exited).toBe(0);
		expect(
			JSON.parse(await new Response(ingested.stdout).text()),
		).toMatchObject({
			candidate: COMPOSER,
			provenance: MODEL_RUN_PROVENANCE,
			availability: "evaluation-only",
		});
	} finally {
		await rm(workDir, { recursive: true, force: true });
	}
});
