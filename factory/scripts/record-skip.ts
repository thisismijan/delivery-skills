import { mkdir, readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { sanitizeHumanText } from "./human-text";
import { SAFE_PATH_SEGMENT, SafePathSegment } from "./task-profile";

export const SKIPPED_WORKERS = [
	"ticket-assessor",
	"feasibility-analyst",
	"groom-explorer",
	"groom-writer",
	"test-writer",
	"implementer",
	"comment-assessor",
	"holdout-reviewer",
	"review-lens",
	"readiness-lens",
] as const;

export const SkippedWorker = z.enum(SKIPPED_WORKERS);
export type SkippedWorker = z.infer<typeof SkippedWorker>;

export const SkipInput = z
	.object({
		skipId: SafePathSegment,
		worker: SkippedWorker,
		reason: z.string().min(1),
	})
	.strict();
export type SkipInput = z.infer<typeof SkipInput>;

export const SkipBatch = z
	.object({
		skips: z.array(SkipInput).min(1),
	})
	.strict();
export type SkipBatch = z.infer<typeof SkipBatch>;

export const SkippedDispatch = SkipInput.extend({
	version: z.literal(1),
	runId: SafePathSegment,
	recordedAt: z.string().min(1),
}).strict();
export type SkippedDispatch = z.infer<typeof SkippedDispatch>;

export function skipDir(root: string, runId: string): string {
	return join(root, SafePathSegment.parse(runId), "skips");
}

export function skipPath(root: string, runId: string, skipId: string): string {
	if (!SAFE_PATH_SEGMENT.test(runId) || !SAFE_PATH_SEGMENT.test(skipId)) {
		throw new Error("run id and skip id must be simple file-safe names");
	}
	return join(skipDir(root, runId), `${skipId}.json`);
}

export function parseSkipInput(input: unknown): SkipInput[] {
	if (input && typeof input === "object" && "skips" in input) {
		return SkipBatch.parse(input).skips;
	}
	return [SkipInput.parse(input)];
}

export function buildSkippedDispatch(input: {
	runId: string;
	skip: SkipInput;
	recordedAt?: string;
}): SkippedDispatch {
	const skip = SkipInput.parse(input.skip);
	return SkippedDispatch.parse({
		version: 1,
		runId: SafePathSegment.parse(input.runId),
		skipId: skip.skipId,
		worker: skip.worker,
		reason: sanitizeHumanText(skip.reason),
		recordedAt: input.recordedAt ?? new Date().toISOString(),
	});
}

export async function persistSkippedDispatch(
	root: string,
	record: SkippedDispatch,
): Promise<string> {
	const parsed = SkippedDispatch.parse(record);
	const path = skipPath(root, parsed.runId, parsed.skipId);
	const existing = await Bun.file(path).exists();
	if (existing) {
		throw new Error(`skip id already recorded: ${parsed.skipId}`);
	}
	await mkdir(skipDir(root, parsed.runId), { recursive: true });
	await Bun.write(path, `${JSON.stringify(parsed, null, 2)}\n`);
	return path;
}

export async function persistSkipBatch(
	root: string,
	runId: string,
	input: unknown,
	recordedAt?: string,
): Promise<string[]> {
	const skips = parseSkipInput(input);
	const paths: string[] = [];
	for (const skip of skips) {
		const record = buildSkippedDispatch({ runId, skip, recordedAt });
		paths.push(await persistSkippedDispatch(root, record));
	}
	return paths;
}

export async function loadSkips(root: string): Promise<SkippedDispatch[]> {
	const runs = await readdir(root, { withFileTypes: true }).catch(() => []);
	const found: SkippedDispatch[] = [];
	for (const run of runs) {
		if (!run.isDirectory() || run.name === "corpus") continue;
		if (!SAFE_PATH_SEGMENT.test(run.name)) {
			throw new Error(`unsafe routing run directory: ${run.name}`);
		}
		const dir = skipDir(root, run.name);
		const files = await readdir(dir, { withFileTypes: true }).catch(() => []);
		for (const file of files) {
			if (!file.isFile() || !file.name.endsWith(".json")) continue;
			const skipId = file.name.slice(0, -".json".length);
			if (!SAFE_PATH_SEGMENT.test(skipId)) {
				throw new Error(`unsafe skip file: ${file.name}`);
			}
			const raw = JSON.parse(await readFile(join(dir, file.name), "utf8")) as unknown;
			const parsed = SkippedDispatch.parse(raw);
			if (parsed.runId !== run.name || parsed.skipId !== skipId) {
				throw new Error(`skip identity does not match its path: ${file.name}`);
			}
			found.push(parsed);
		}
	}
	return found.sort((a, b) => a.recordedAt.localeCompare(b.recordedAt));
}

if (import.meta.main) {
	const [command, root, runId, inputFile] = process.argv.slice(2);
	if (command !== "persist" || !root || !runId || !inputFile) {
		console.error(
			"usage: record-skip persist <routing-root> <run-id> <skips.json>",
		);
		process.exit(2);
	}
	try {
		const input = await Bun.file(inputFile).json();
		const paths = await persistSkipBatch(root, runId, input);
		console.log(JSON.stringify({ paths }));
	} catch (error) {
		console.error(error instanceof Error ? error.message : String(error));
		process.exit(1);
	}
}
