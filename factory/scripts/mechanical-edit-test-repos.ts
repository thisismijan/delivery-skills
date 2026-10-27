import { mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { applyMechanicalEdit } from "./apply-mechanical-edit";
import {
	type CorpusEntry,
	TEST_REPO_STAND_IN_PROVENANCE,
	scoreCandidate,
	writeCorpus,
} from "./evaluation-corpus";
import { generatePairedEvidence } from "./generate-paired-evidence";
import {
	type UnscriptedMechanicalFixture,
	representativeUnscriptedMechanicalObservations,
	unscriptedMechanicalFixtures,
} from "./mechanical-edit-scoring";
import {
	fastCatalogueCandidateIds,
	loadModelCatalogue,
	requireFastCatalogueCandidate,
} from "./model-catalogue";
import { evaluatePairedEvidence } from "./paired-evaluation";

export { TEST_REPO_STAND_IN_PROVENANCE };

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function identifierPattern(name: string, flags: string): RegExp {
	return new RegExp(
		`(?<![A-Za-z0-9_])${escapeRegExp(name)}(?![A-Za-z0-9_])`,
		flags,
	);
}

export function replaceIdentifier(
	source: string,
	from: string,
	to: string,
): string {
	return source.replace(identifierPattern(from, "g"), to);
}

export function containsIdentifier(source: string, name: string): boolean {
	return identifierPattern(name, "").test(source);
}

export function applyListedFileStandIn(
	fixture: UnscriptedMechanicalFixture,
): Record<string, string> {
	const next: Record<string, string> = { ...fixture.files };
	if (fixture.payload.operation !== "rename") {
		return next;
	}
	const from = fixture.payload.from;
	const to = fixture.payload.to;
	if (!from || !to) {
		return next;
	}
	for (const file of fixture.payload.files) {
		const contents = next[file];
		if (contents === undefined) {
			continue;
		}
		next[file] = replaceIdentifier(contents, from, to);
	}
	return next;
}

async function git(cwd: string, args: string[]): Promise<void> {
	const proc = Bun.spawn(["git", "-C", cwd, ...args], {
		stdout: "pipe",
		stderr: "pipe",
	});
	const code = await proc.exited;
	if (code !== 0) {
		const stderr = await new Response(proc.stderr).text();
		throw new Error(stderr.trim() || `git ${args.join(" ")} failed`);
	}
}

export async function materializeUnscriptedMechanicalRepo(
	fixture: UnscriptedMechanicalFixture,
	parentDir: string,
): Promise<string> {
	const root = join(parentDir, fixture.id);
	await mkdir(root, { recursive: true });
	const init = Bun.spawn(["git", "init", "-q", root], {
		stdout: "pipe",
		stderr: "pipe",
	});
	if ((await init.exited) !== 0) {
		throw new Error("git init failed");
	}
	for (const [path, contents] of Object.entries(fixture.files)) {
		const file = join(root, path);
		await mkdir(dirname(file), { recursive: true });
		await Bun.write(file, contents);
	}
	await git(root, ["add", "-A"]);
	await git(root, [
		"-c",
		"user.email=stand-in@example.com",
		"-c",
		"user.name=stand-in",
		"-c",
		"commit.gpgsign=false",
		"commit",
		"-q",
		"-m",
		fixture.id,
	]);
	return root;
}

export async function materializeUnscriptedMechanicalRepos(
	parentDir: string,
): Promise<string[]> {
	const roots: string[] = [];
	for (const fixture of unscriptedMechanicalFixtures()) {
		roots.push(await materializeUnscriptedMechanicalRepo(fixture, parentDir));
	}
	return roots;
}

function standInResult(fixture: UnscriptedMechanicalFixture): {
	utility: number;
	criticalMisses: number;
} {
	if (fixture.payload.operation !== "rename") {
		return { utility: 0.5, criticalMisses: 0 };
	}
	const from = fixture.payload.from;
	if (!from) {
		return { utility: 0.5, criticalMisses: 0 };
	}
	const rewritten = applyListedFileStandIn(fixture);
	const listed = new Set(fixture.payload.files);
	let leftoverListed = false;
	let leftoverUnlisted = 0;
	for (const [path, original] of Object.entries(fixture.files)) {
		const contents = rewritten[path] ?? original;
		if (!containsIdentifier(contents, from)) {
			continue;
		}
		if (listed.has(path)) {
			leftoverListed = true;
		} else {
			leftoverUnlisted += 1;
		}
	}
	return {
		utility: leftoverListed ? 0.5 : 1,
		criticalMisses: leftoverUnlisted,
	};
}

async function writeTree(
	root: string,
	files: Record<string, string>,
): Promise<void> {
	for (const [path, contents] of Object.entries(files)) {
		const file = join(root, path);
		await mkdir(dirname(file), { recursive: true });
		await Bun.write(file, contents);
	}
}

function characterCount(files: Record<string, string>): number {
	return Object.values(files).reduce(
		(sum, contents) => sum + contents.length,
		0,
	);
}

async function writeJson(path: string, value: unknown): Promise<void> {
	await mkdir(dirname(path), { recursive: true });
	await Bun.write(path, `${JSON.stringify(value, null, 2)}\n`);
}

export async function benchmarkUnscriptedMechanicalRepos(input?: {
	workDir?: string;
	candidateModel?: string;
}): Promise<{
	workDir: string;
	corpusDir: string;
	entries: CorpusEntry[];
	repos: string[];
}> {
	const workDir =
		input?.workDir ??
		join(tmpdir(), `mechanical-edit-test-repos-${Date.now()}`);
	const catalogue = await loadModelCatalogue();
	const named =
		input?.candidateModel ?? fastCatalogueCandidateIds(catalogue)[0];
	if (!named) {
		throw new Error("the fast catalogue tier has no candidates");
	}
	const candidateModel = requireFastCatalogueCandidate(catalogue, named);
	const repoParent = join(workDir, "repos");
	const corpusDir = join(workDir, "corpus");
	await mkdir(repoParent, { recursive: true });
	const fixtures = unscriptedMechanicalFixtures();
	const observations =
		representativeUnscriptedMechanicalObservations("representative-run");
	const repos: string[] = [];
	const entries: CorpusEntry[] = [];

	for (let index = 0; index < fixtures.length; index += 1) {
		const fixture = fixtures[index];
		const observation = observations[index];
		if (!fixture || !observation) {
			continue;
		}
		const repo = await materializeUnscriptedMechanicalRepo(fixture, repoParent);
		repos.push(repo);
		const applied = await applyMechanicalEdit({
			payload: fixture.payload,
			root: repo,
		});
		if (applied.apply !== "select-model") {
			throw new Error(`${fixture.id} was applied by script`);
		}
		const candidateFiles = applyListedFileStandIn(fixture);
		const scored = standInResult(fixture);
		const planDir = join(workDir, "plans", fixture.id);
		const checks = [
			{ id: "select-model", hidden: false, passed: true },
			{ id: "git-repo", hidden: false, passed: true },
			{
				id: "listed-files-only",
				hidden: false,
				passed: fixture.payload.files.every((file) => file in fixture.files),
			},
		];
		await writeTree(join(planDir, "baseline-skill"), {
			"SKILL.md": "select-model worker\n",
		});
		await writeTree(join(planDir, "candidate-skill"), {
			"SKILL.md": "test-repo stand-in rewrite\n",
		});
		await writeTree(join(planDir, "baseline-output"), fixture.files);
		await writeTree(join(planDir, "candidate-output"), candidateFiles);
		await Bun.write(join(planDir, "task.md"), `${fixture.reason}\n`);
		await Bun.write(
			join(planDir, "environment.json"),
			'{"kind":"test-repo"}\n',
		);
		await Bun.write(join(planDir, "context.md"), "listed fixture files\n");
		await Bun.write(join(planDir, "tools.json"), '{"tools":["git"]}\n');
		await Bun.write(
			join(planDir, "contract.md"),
			"Apply a classified rename, import-only, or format-only unit without changing behaviour.\n",
		);
		const baselineChars = characterCount(fixture.files);
		const candidateChars = characterCount(candidateFiles);
		await writeJson(join(planDir, "baseline-usage.json"), {
			source: "characters",
			inputChars: baselineChars,
			outputChars: baselineChars,
			wallTimeMs: 1,
		});
		await writeJson(join(planDir, "candidate-usage.json"), {
			source: "characters",
			inputChars: candidateChars,
			outputChars: candidateChars,
			wallTimeMs: 1,
		});
		await writeJson(join(planDir, "baseline-result.json"), {
			utility: 1,
			criticalMisses: 0,
			repairAttempts: 0,
			checks,
		});
		await writeJson(join(planDir, "candidate-result.json"), {
			utility: scored.utility,
			criticalMisses: scored.criticalMisses,
			repairAttempts: 0,
			checks,
		});
		const evidence = await generatePairedEvidence(
			{
				version: 1,
				candidateId: `${candidateModel}-${fixture.id}`,
				intendedEffect: "behaviour",
				model: candidateModel,
				timeoutMs: 60_000,
				fixed: {
					taskFixture: "task.md",
					environment: "environment.json",
					allowedContext: ["context.md"],
					tools: "tools.json",
					outputContract: "contract.md",
				},
				hiddenChecks: {
					available: false,
					reason: "a test-repo stand-in has no hidden gold oracle",
				},
				mutation: {
					required: false,
					reason: "a test-repo stand-in does not mutate hidden checks",
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
			},
			planDir,
		);
		const paired = evaluatePairedEvidence(evidence);
		await writeJson(join(workDir, "evidence", `${fixture.id}.json`), evidence);
		entries.push(
			scoreCandidate(observation, {
				candidateModel,
				relativeUtility: Math.min(1, paired.relativeUtility),
				criticalMisses: paired.criticalMisses,
				provenance: TEST_REPO_STAND_IN_PROVENANCE,
			}),
		);
	}

	await writeCorpus(corpusDir, entries);
	return { workDir: resolve(workDir), corpusDir, entries, repos };
}

if (import.meta.main) {
	try {
		const catalogue = await loadModelCatalogue();
		const fastCandidates = fastCatalogueCandidateIds(catalogue);
		const result = await benchmarkUnscriptedMechanicalRepos({
			workDir: process.argv[2],
			candidateModel: process.argv[3] ?? fastCandidates[0],
		});
		console.log(
			JSON.stringify({
				candidate: result.entries[0]?.evaluation?.candidateModel,
				fastCandidates,
				workDir: result.workDir,
				corpus: result.corpusDir,
				count: result.entries.length,
				provenance: TEST_REPO_STAND_IN_PROVENANCE,
				fixtures: unscriptedMechanicalFixtures().map((fixture) => fixture.id),
			}),
		);
	} catch (error) {
		console.error(error instanceof Error ? error.message : String(error));
		process.exit(1);
	}
}
