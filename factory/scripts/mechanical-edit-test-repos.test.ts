import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { applyMechanicalEdit } from "./apply-mechanical-edit";
import { TEST_REPO_STAND_IN_PROVENANCE } from "./evaluation-corpus";
import {
	MIN_EVALUATED_FAST_SAMPLES,
	applyFastPromotion,
	evaluatePromotion,
} from "./fast-dispatch";
import {
	UNSCRIPTED_MECHANICAL_CANDIDATE,
	unscriptedMechanicalFixtures,
} from "./mechanical-edit-scoring";
import {
	applyListedFileStandIn,
	benchmarkUnscriptedMechanicalRepos,
	materializeUnscriptedMechanicalRepos,
} from "./mechanical-edit-test-repos";
import { loadModelCatalogue } from "./model-catalogue";

test("each unscripted fixture materializes as a git repository", async () => {
	const parent = await mkdtemp(join(tmpdir(), "mechanical-edit-repos-"));
	try {
		const repos = await materializeUnscriptedMechanicalRepos(parent);
		const fixtures = unscriptedMechanicalFixtures();
		expect(repos.length).toBe(fixtures.length);
		for (const fixture of fixtures) {
			const root = join(parent, fixture.id);
			expect(await Bun.file(join(root, ".git", "HEAD")).exists()).toBe(true);
			for (const [path, contents] of Object.entries(fixture.files)) {
				expect(await Bun.file(join(root, path)).text()).toBe(contents);
			}
			const applied = await applyMechanicalEdit({
				payload: fixture.payload,
				root,
			});
			expect(applied.apply).toBe("select-model");
		}
	} finally {
		await rm(parent, { recursive: true, force: true });
	}
});

test("a listed-file stand-in leaves unlisted files unchanged", () => {
	const fixture = unscriptedMechanicalFixtures().find(
		(item) => item.id === "python-incomplete-graph",
	);
	expect(fixture).toBeDefined();
	if (!fixture) return;
	const rewritten = applyListedFileStandIn(fixture);
	expect(rewritten["src/a.py"]).toContain("slugify");
	expect(rewritten["src/a.py"]).not.toContain("slugify_title");
	expect(rewritten["src/b.py"]).toBe(fixture.files["src/b.py"]);
});

test("test-repo stand-in scores do not fill the graduation sample", async () => {
	const workDir = await mkdtemp(join(tmpdir(), "mechanical-edit-bench-"));
	const catalogue = await loadModelCatalogue();
	const before = structuredClone(catalogue);
	try {
		const result = await benchmarkUnscriptedMechanicalRepos({
			workDir,
			candidateModel: UNSCRIPTED_MECHANICAL_CANDIDATE,
		});
		expect(result.entries.length).toBeGreaterThanOrEqual(
			MIN_EVALUATED_FAST_SAMPLES,
		);
		expect(
			result.entries.every(
				(entry) =>
					entry.evaluation?.provenance === TEST_REPO_STAND_IN_PROVENANCE &&
					entry.evaluation.candidateModel === UNSCRIPTED_MECHANICAL_CANDIDATE &&
					entry.observation.source === "representative-run",
			),
		).toBe(true);
		expect(await Bun.file(join(result.corpusDir, "index.json")).exists()).toBe(
			true,
		);
		const verdict = evaluatePromotion(
			result.entries,
			UNSCRIPTED_MECHANICAL_CANDIDATE,
			{ approval: { candidateModel: UNSCRIPTED_MECHANICAL_CANDIDATE } },
		);
		expect(verdict.sampleSize).toBe(0);
		expect(verdict.evidenceCleared).toBe(false);
		expect(verdict.availability).toBe("evaluation-only");
		expect(applyFastPromotion(catalogue, verdict)).toEqual(before);
		expect(
			catalogue.tiers.fast.candidates.find(
				(candidate) => candidate.id === UNSCRIPTED_MECHANICAL_CANDIDATE,
			)?.availability,
		).toBe("evaluation-only");
	} finally {
		await rm(workDir, { recursive: true, force: true });
	}
});

test("the CLI writes corpus under the caller directory", async () => {
	const workDir = await mkdtemp(join(tmpdir(), "mechanical-edit-cli-"));
	try {
		const proc = Bun.spawn(
			["bun", join(import.meta.dir, "mechanical-edit-test-repos.ts"), workDir],
			{ stdout: "pipe", stderr: "pipe" },
		);
		expect(await proc.exited).toBe(0);
		expect(JSON.parse(await new Response(proc.stdout).text())).toMatchObject({
			candidate: "haiku",
			workDir,
			count: unscriptedMechanicalFixtures().length,
			provenance: TEST_REPO_STAND_IN_PROVENANCE,
		});
	} finally {
		await rm(workDir, { recursive: true, force: true });
	}
});
