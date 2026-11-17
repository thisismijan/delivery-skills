import { z } from "zod";
import { loadConfig } from "./config";
import type { ReviewBreadth } from "./levels";

export const REVIEW_LENSES = [
	"correctness-security",
	"tests-specification",
	"reliability-operations",
	"repository-blast-radius",
] as const;

const SENSITIVE_SURFACES = new Set([
	"data",
	"contract",
	"config",
	"auth",
	"infra",
]);

export const ReviewFanoutInput = z.object({
	changedFiles: z.number().int().nonnegative(),
	changedLines: z.number().int().nonnegative(),
	reversible: z.boolean(),
	classificationComplete: z.boolean(),
	surfaces: z
		.array(
			z.enum([
				"data",
				"contract",
				"config",
				"auth",
				"infra",
				"dependencies",
				"user-facing",
			]),
		)
		.default([]),
	// Paths the diff scan placed in an owner-drawn red zone.
	redZones: z.array(z.string().min(1)).default([]),
});

export type ReviewFanoutInput = z.input<typeof ReviewFanoutInput>;
type ParsedFanoutInput = z.output<typeof ReviewFanoutInput>;

// Measured across benchmark loops: every blocking finding on a reversible,
// non-sensitive change came from the first two lenses, so the other two run
// only where their surfaces (rollout, dependencies, blast radius) are present.
export const CONTAINED_MAX_FILES = 6;
export const CONTAINED_MAX_LINES = 400;

export interface ReviewFanoutPlan {
	mode: "empty" | "small" | "contained" | "full";
	lenses: (typeof REVIEW_LENSES)[number][];
	reason: string;
}

export const READINESS_LENSES = [
	"rollback",
	"compatibility",
	"security",
	"operability",
] as const;

export interface ReadinessFanoutPlan {
	mode: "empty" | "small" | "full";
	lenses: (typeof READINESS_LENSES)[number][];
	reason: string;
}

function sensitiveSurfaces(parsed: ParsedFanoutInput): string[] {
	return parsed.surfaces.filter((surface) => SENSITIVE_SURFACES.has(surface));
}

function emptyChange(parsed: ParsedFanoutInput, sensitive: string[]): boolean {
	return (
		parsed.classificationComplete &&
		parsed.changedFiles === 0 &&
		parsed.changedLines === 0 &&
		parsed.reversible &&
		sensitive.length === 0
	);
}

function smallChange(parsed: ParsedFanoutInput, sensitive: string[]): boolean {
	return (
		parsed.classificationComplete &&
		parsed.changedFiles <= 2 &&
		parsed.changedLines < 50 &&
		parsed.reversible &&
		sensitive.length === 0
	);
}

export function planReadinessFanout(
	input: ReviewFanoutInput,
	breadth: ReviewBreadth = "measured",
): ReadinessFanoutPlan {
	const parsed = ReviewFanoutInput.parse(input);
	const sensitive = sensitiveSurfaces(parsed);
	if (emptyChange(parsed, sensitive)) {
		return {
			mode: "empty",
			lenses: [],
			reason: "no reviewable code in the pinned diff",
		};
	}
	if (breadth === "every-lens") {
		return {
			mode: "full",
			lenses: [...READINESS_LENSES],
			reason: "the max level runs every readiness lens on every change",
		};
	}
	if (smallChange(parsed, sensitive)) {
		return {
			mode: "small",
			lenses: [],
			reason: "small reversible change with no sensitive surface",
		};
	}
	const reasons = [
		!parsed.classificationComplete ? "classification incomplete" : undefined,
		parsed.changedFiles > 2 ? "more than 2 changed files" : undefined,
		parsed.changedLines >= 50 ? "at least 50 changed lines" : undefined,
		!parsed.reversible ? "one-way change" : undefined,
		sensitive.length > 0
			? `sensitive surfaces: ${sensitive.join(", ")}`
			: undefined,
	].filter((reason): reason is string => reason !== undefined);
	return {
		mode: "full",
		lenses: [...READINESS_LENSES],
		reason: reasons.join("; "),
	};
}

export function planReviewFanout(
	input: ReviewFanoutInput,
	breadth: ReviewBreadth = "measured",
): ReviewFanoutPlan {
	const parsed = ReviewFanoutInput.parse(input);
	const sensitive = sensitiveSurfaces(parsed);
	if (emptyChange(parsed, sensitive)) {
		return {
			mode: "empty",
			lenses: [],
			reason: "no reviewable code in the pinned diff",
		};
	}

	if (parsed.redZones.length > 0) {
		return {
			mode: "full",
			lenses: [...REVIEW_LENSES],
			reason: `red zone: ${parsed.redZones.join(", ")}`,
		};
	}

	if (breadth === "every-lens") {
		return {
			mode: "full",
			lenses: [...REVIEW_LENSES],
			reason: "the max level runs every lens on every change",
		};
	}

	if (smallChange(parsed, sensitive)) {
		return {
			mode: "small",
			lenses: [...REVIEW_LENSES.slice(0, 2)],
			reason: "small reversible change with no sensitive surface",
		};
	}

	const dependencies = parsed.surfaces.includes("dependencies");
	const contained =
		parsed.classificationComplete &&
		parsed.changedFiles <= CONTAINED_MAX_FILES &&
		parsed.changedLines < CONTAINED_MAX_LINES &&
		parsed.reversible &&
		sensitive.length === 0 &&
		!dependencies;

	if (contained) {
		return {
			mode: "contained",
			lenses: [...REVIEW_LENSES.slice(0, 2)],
			reason: `reversible change within ${CONTAINED_MAX_FILES} files and ${CONTAINED_MAX_LINES} lines with no sensitive surface or dependency change`,
		};
	}

	const sizeOnly =
		parsed.classificationComplete &&
		parsed.reversible &&
		sensitive.length === 0 &&
		!dependencies;
	if (breadth === "size-trimmed" && sizeOnly) {
		return {
			mode: "contained",
			lenses: [...REVIEW_LENSES.slice(0, 2)],
			reason:
				"the min level does not add lenses for size alone on a reversible change with no sensitive surface or dependency change",
		};
	}

	const reasons = [
		!parsed.classificationComplete ? "classification incomplete" : undefined,
		parsed.changedFiles > CONTAINED_MAX_FILES
			? `more than ${CONTAINED_MAX_FILES} changed files`
			: undefined,
		parsed.changedLines >= CONTAINED_MAX_LINES
			? `at least ${CONTAINED_MAX_LINES} changed lines`
			: undefined,
		!parsed.reversible ? "one-way change" : undefined,
		sensitive.length > 0
			? `sensitive surfaces: ${sensitive.join(", ")}`
			: undefined,
		dependencies ? "dependency change" : undefined,
	].filter((reason): reason is string => reason !== undefined);

	return {
		mode: "full",
		lenses: [...REVIEW_LENSES],
		reason: reasons.join("; "),
	};
}

// Spec artefacts are reviewed by the holdout reviewer and lens 2 against the
// code; counting them made every change look large and sensitive.
export const NON_CODE_PREFIXES = ["openspec/", ".delivery/", ".review/"];

export interface ReviewableDiff {
	changedFiles: number;
	changedLines: number;
	paths: string[];
	excluded: string[];
}

export function measureReviewableDiff(numstat: string): ReviewableDiff {
	const paths: string[] = [];
	const excluded: string[] = [];
	let changedLines = 0;
	for (const line of numstat.split("\n")) {
		if (!line.trim()) continue;
		const [added, deleted, ...rest] = line.split("\t");
		const path = rest.join("\t");
		if (!path || added === undefined || deleted === undefined) {
			throw new Error(`unreadable numstat line: ${line}`);
		}
		if (NON_CODE_PREFIXES.some((prefix) => path.startsWith(prefix))) {
			excluded.push(path);
			continue;
		}
		paths.push(path);
		// Binary files report "-" and count as one changed line so they are never free.
		changedLines +=
			added === "-" || deleted === "-" ? 1 : Number(added) + Number(deleted);
	}
	return { changedFiles: paths.length, changedLines, paths, excluded };
}

const SEVERITIES = ["Critical", "High", "Medium", "Low"] as const;

export const LensCandidates = z.object({
	candidates: z.array(z.object({ severity: z.enum(SEVERITIES) })),
});

export type LensCandidates = z.infer<typeof LensCandidates>;

export interface AdjudicationPlan {
	mode: "none" | "standard" | "main";
	reason: string;
}

export function planAdjudication(input: LensCandidates): AdjudicationPlan {
	const { candidates } = LensCandidates.parse(input);
	if (candidates.length === 0) {
		return { mode: "none", reason: "no lens returned a candidate" };
	}
	if (candidates.every((candidate) => candidate.severity === "Low")) {
		return {
			mode: "standard",
			reason: "every candidate is Low, which cannot block on its own",
		};
	}
	return {
		mode: "main",
		reason: "a candidate at Medium or above can block readiness",
	};
}

const LensName = z.enum(REVIEW_LENSES);

const CoverageInputSchema = z
	.object({
		scope: z.enum(["full", "delta"]),
		plannedLenses: z.array(LensName),
		reports: z.array(
			z.object({ lens: z.string(), examined: z.unknown() }).strict(),
		),
		focused: z
			.array(
				z
					.object({
						path: z.string(),
						status: z.enum(["returned", "failed"]),
						examined: z.unknown(),
					})
					.strict(),
			)
			.optional(),
	})
	.strict();

export type CoverageInput = z.input<typeof CoverageInputSchema>;

export const CoverageResult = z
	.object({
		status: z.enum(["checked", "skipped"]),
		scope: z.enum(["full", "delta"]),
		from: z.string(),
		head: z.string(),
		earlier: z.enum(["none", "read"]),
		reason: z.string(),
		checkedFiles: z.number().int().nonnegative(),
		lenses: z.array(LensName),
		binary: z.array(z.string()),
		unexamined: z.array(
			z
				.object({
					path: z.string(),
					carried: z.boolean(),
					focusedPass: z.enum(["pending", "examined", "failed"]),
				})
				.strict(),
		),
		needsFocusedPass: z.array(z.string()),
		stillUnexamined: z.array(z.string()),
		recordedPasses: z
			.array(
				z
					.object({
						path: z.string(),
						focusedPass: z.enum(["examined", "failed"]),
					})
					.strict(),
			)
			.default([]),
	})
	.strict();

export type CoverageResult = z.output<typeof CoverageResult>;

export interface ChangedFiles {
	paths: string[];
	binary: string[];
}

export interface CoverageChanged extends ChangedFiles {
	from: string;
	head: string;
}

function parseStrict<S extends z.ZodTypeAny>(
	schema: S,
	value: unknown,
	what: string,
): z.output<S> {
	const result = schema.safeParse(value);
	if (result.success) return result.data;
	const issues = result.error.issues
		.map((issue) => `${issue.path.join(".") || "value"}: ${issue.message}`)
		.join("; ");
	throw new Error(`${what} is malformed (${issues})`);
}

function malformedEntry(entry: unknown): string | undefined {
	if (typeof entry !== "string") return "an entry that is not text";
	if (entry === "") return "an empty entry";
	if (entry.startsWith("/")) {
		return `the absolute path ${JSON.stringify(entry)}`;
	}
	if (entry.startsWith("./"))
		return `the path ${JSON.stringify(entry)} that starts with ./`;
	if (/[\n\r\0]/.test(entry))
		return `the path ${JSON.stringify(entry)} with a line break or NUL`;
	return undefined;
}

function examinedList(owner: string, value: unknown): string[] {
	if (!Array.isArray(value)) throw new Error(`${owner} has no examined list`);
	for (const entry of value) {
		const problem = malformedEntry(entry);
		if (problem) throw new Error(`${owner} lists ${problem}`);
	}
	return value as string[];
}

function carriedPaths(
	changed: ChangedFiles,
	earlier: CoverageResult | undefined,
): string[] {
	if (!earlier) return [];
	const seen = new Set([...changed.paths, ...changed.binary]);
	const carried: string[] = [];
	for (const path of earlier.stillUnexamined) {
		if (seen.has(path)) continue;
		seen.add(path);
		carried.push(path);
	}
	return carried;
}

export function planCoverage(
	input: unknown,
	changed: CoverageChanged,
	earlierArtifact: unknown,
	priorArtifact: unknown,
): CoverageResult {
	const parsed = parseStrict(CoverageInputSchema, input, "the coverage input");
	const earlier =
		earlierArtifact === undefined
			? undefined
			: parseStrict(CoverageResult, earlierArtifact, "the earlier coverage");
	const prior =
		priorArtifact === undefined
			? undefined
			: parseStrict(CoverageResult, priorArtifact, "the recorded coverage");
	if (earlier && earlier.head !== changed.from) {
		throw new Error(
			`the earlier coverage was recorded for ${earlier.head}, not ${changed.from}`,
		);
	}
	if (prior && prior.head !== changed.head) {
		throw new Error(
			`the recorded coverage belongs to ${prior.head}, not ${changed.head}`,
		);
	}

	const planned = new Set<string>(parsed.plannedLenses);
	const examined = new Set<string>();
	const reported = new Set<string>();
	for (const entry of parsed.reports) {
		if (!planned.has(entry.lens)) {
			throw new Error(`a report names ${entry.lens}, which was not planned`);
		}
		if (reported.has(entry.lens)) {
			throw new Error(`two reports name ${entry.lens}`);
		}
		reported.add(entry.lens);
		const owner = `the report for ${entry.lens}`;
		for (const path of examinedList(owner, entry.examined)) {
			examined.add(path);
		}
	}
	for (const lens of planned) {
		if (!reported.has(lens)) throw new Error(`${lens} has no report`);
	}
	const focused = parsed.focused ?? [];

	const base = {
		scope: parsed.scope,
		from: changed.from,
		head: changed.head,
		earlier: earlier ? ("read" as const) : ("none" as const),
		lenses: [...parsed.plannedLenses],
	};

	if (parsed.plannedLenses.length === 0) {
		if (focused.length > 0) {
			throw new Error(
				`the pass for ${focused[0]?.path} has nothing to attach to, because no lens ran`,
			);
		}
		return {
			...base,
			status: "skipped",
			reason: "no lens ran, so there is nothing to check",
			checkedFiles: 0,
			binary: [],
			unexamined: [],
			needsFocusedPass: [],
			stillUnexamined: [],
			recordedPasses: [],
		};
	}

	const carried = new Set(carriedPaths(changed, earlier));
	const files = [...changed.paths, ...carried];
	const open = files.filter((path) => !examined.has(path));
	const openSet = new Set(open);

	const outcomes = new Map<string, "examined" | "failed">();
	for (const entry of prior?.recordedPasses ?? []) {
		outcomes.set(entry.path, entry.focusedPass);
	}
	for (const entry of prior?.unexamined ?? []) {
		if (entry.focusedPass !== "pending") {
			outcomes.set(entry.path, entry.focusedPass);
		}
	}
	const seenNew = new Set<string>();
	for (const outcome of focused) {
		const owner = `the focused pass for ${outcome.path}`;
		if (seenNew.has(outcome.path)) {
			throw new Error(`two outcomes name ${outcome.path}`);
		}
		seenNew.add(outcome.path);
		if (outcomes.has(outcome.path)) {
			throw new Error(`${outcome.path} already has a recorded focused pass`);
		}
		if (!openSet.has(outcome.path)) {
			throw new Error(`${owner} names a file that is not unexamined`);
		}
		if (outcome.status === "failed") {
			if (outcome.examined !== undefined) {
				throw new Error(`${owner} failed but carries an examined list`);
			}
			outcomes.set(outcome.path, "failed");
			continue;
		}
		const list = examinedList(owner, outcome.examined);
		outcomes.set(
			outcome.path,
			list.includes(outcome.path) ? "examined" : "failed",
		);
	}

	const unexamined = open.map((path) => ({
		path,
		carried: carried.has(path),
		focusedPass: outcomes.get(path) ?? ("pending" as const),
	}));
	return {
		...base,
		status: "checked",
		reason: "the changed files were checked against the lens reports",
		checkedFiles: files.length,
		binary: [...changed.binary],
		unexamined,
		needsFocusedPass: unexamined
			.filter((entry) => entry.focusedPass === "pending")
			.map((entry) => entry.path),
		stillUnexamined: unexamined
			.filter((entry) => entry.focusedPass !== "examined")
			.map((entry) => entry.path),
		recordedPasses: [...outcomes].map(([path, focusedPass]) => ({
			path,
			focusedPass,
		})),
	};
}

export function parseNumstatZ(raw: string): ChangedFiles {
	const paths: string[] = [];
	const binary: string[] = [];
	for (const entry of raw.split("\0")) {
		if (entry === "") continue;
		const first = entry.indexOf("\t");
		const second = first < 0 ? -1 : entry.indexOf("\t", first + 1);
		const path = second < 0 ? "" : entry.slice(second + 1);
		if (!path) throw new Error(`unreadable numstat entry: ${entry}`);
		if (NON_CODE_PREFIXES.some((prefix) => path.startsWith(prefix))) continue;
		if (/[\n\r]/.test(path)) {
			throw new Error(
				`the changed path ${JSON.stringify(path)} holds a line break and cannot be listed`,
			);
		}
		const isBinary =
			entry.slice(0, first) === "-" && entry.slice(first + 1, second) === "-";
		(isBinary ? binary : paths).push(path);
	}
	return { paths, binary };
}

async function gitChangedFiles(
	from: string,
	head: string,
): Promise<ChangedFiles> {
	const proc = Bun.spawn(
		[
			"git",
			"-c",
			"core.quotepath=false",
			"diff",
			"--numstat",
			"-z",
			"--no-renames",
			`${from}...${head}`,
		],
		{ stdout: "pipe", stderr: "pipe" },
	);
	const [out, err, code] = await Promise.all([
		new Response(proc.stdout).text(),
		new Response(proc.stderr).text(),
		proc.exited,
	]);
	if (code !== 0) throw new Error(err.trim() || `git diff exited ${code}`);
	return parseNumstatZ(out);
}

async function readArtifact(path: string): Promise<CoverageResult | undefined> {
	const file = Bun.file(path);
	if (!(await file.exists())) return undefined;
	let value: unknown;
	try {
		value = JSON.parse(await file.text());
	} catch {
		throw new Error(`${path} is not valid JSON`);
	}
	return parseStrict(CoverageResult, value, path);
}

function splitEarlier(
	args: string[],
): { positional: string[]; earlier?: string } | undefined {
	const positional: string[] = [];
	let earlier: string | undefined;
	for (let index = 0; index < args.length; index++) {
		const arg = args[index] as string;
		if (arg !== "--earlier") {
			positional.push(arg);
			continue;
		}
		earlier = args[++index];
		if (!earlier) return undefined;
	}
	return earlier === undefined ? { positional } : { positional, earlier };
}

async function gitNumstat(base: string, head: string): Promise<string> {
	const proc = Bun.spawn(["git", "diff", "--numstat", `${base}...${head}`], {
		stdout: "pipe",
		stderr: "pipe",
	});
	const [out, err, code] = await Promise.all([
		new Response(proc.stdout).text(),
		new Response(proc.stderr).text(),
		proc.exited,
	]);
	if (code !== 0) throw new Error(err.trim() || `git diff exited ${code}`);
	return out;
}

const USAGE = [
	"usage: review-fanout <input.json>",
	"       review-fanout measure <base> <head>",
	"       review-fanout paths <base-or-since> <head> [--earlier <lens-coverage.json>]",
	"       review-fanout coverage <base-or-since> <head> <input.json> <lens-coverage.json> [--earlier <lens-coverage.json>]",
	"       review-fanout adjudication <candidates.json>",
	"       review-fanout readiness <input.json>",
].join("\n");

if (import.meta.main) {
	const [first, ...rest] = process.argv.slice(2);
	if (!first) {
		console.error(USAGE);
		process.exit(2);
	}
	try {
		if (first === "measure") {
			const [base, head] = rest;
			if (!base || !head) {
				console.error(USAGE);
				process.exit(2);
			}
			const diff = measureReviewableDiff(await gitNumstat(base, head));
			console.log(JSON.stringify(diff, null, 2));
		} else if (first === "paths") {
			const args = splitEarlier(rest);
			const [from, head, ...extra] = args?.positional ?? [];
			if (!args || !from || !head || extra.length > 0) {
				console.error(USAGE);
				process.exit(2);
			}
			const earlier = args.earlier
				? await readArtifact(args.earlier)
				: undefined;
			if (earlier && earlier.head !== from) {
				throw new Error(
					`the earlier coverage was recorded for ${earlier.head}, not ${from}`,
				);
			}
			const changed = await gitChangedFiles(from, head);
			const carried = carriedPaths(changed, earlier);
			console.log(
				JSON.stringify(
					{
						paths: [...changed.paths, ...carried],
						binary: changed.binary,
						carried,
					},
					null,
					2,
				),
			);
		} else if (first === "coverage") {
			const args = splitEarlier(rest);
			const [from, head, inputPath, outPath, ...extra] = args?.positional ?? [];
			if (
				!args ||
				!from ||
				!head ||
				!inputPath ||
				!outPath ||
				extra.length > 0
			) {
				console.error(USAGE);
				process.exit(2);
			}
			const input = parseStrict(
				CoverageInputSchema,
				await Bun.file(inputPath).json(),
				"the coverage input",
			);
			const prior = await readArtifact(outPath);
			const earlier = args.earlier
				? await readArtifact(args.earlier)
				: undefined;
			const noLensRan =
				input.plannedLenses.length === 0 && input.reports.length === 0;
			const files = noLensRan
				? { paths: [], binary: [] }
				: await gitChangedFiles(from, head);
			const result = planCoverage(
				input,
				{ from, head, ...files },
				earlier,
				prior,
			);
			const text = JSON.stringify(result, null, 2);
			await Bun.write(outPath, `${text}\n`);
			console.log(text);
		} else if (first === "adjudication") {
			if (!rest[0]) {
				console.error(USAGE);
				process.exit(2);
			}
			const input = LensCandidates.parse(await Bun.file(rest[0]).json());
			console.log(JSON.stringify(planAdjudication(input), null, 2));
		} else if (first === "readiness") {
			if (!rest[0]) {
				console.error(USAGE);
				process.exit(2);
			}
			const input = ReviewFanoutInput.parse(await Bun.file(rest[0]).json());
			console.log(
				JSON.stringify(
					planReadinessFanout(input, loadConfig().reviewBreadth),
					null,
					2,
				),
			);
		} else {
			const input = ReviewFanoutInput.parse(await Bun.file(first).json());
			console.log(
				JSON.stringify(
					planReviewFanout(input, loadConfig().reviewBreadth),
					null,
					2,
				),
			);
		}
	} catch (error) {
		console.error(error instanceof Error ? error.message : String(error));
		process.exit(1);
	}
}
