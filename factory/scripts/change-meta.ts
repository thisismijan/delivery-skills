import { join } from "node:path";
import { z } from "zod";

// Factory metadata persisted alongside an OpenSpec change and committed on the
// spec branch. Draft records the honest complexity signal here so that
// /execute selects the implementation model from the recorded decision,
// never from a fresh (and possibly wrong) LLM guess.
export const META_FILENAME = ".delivery.json";

export const ChangeMeta = z.object({
	workItemKey: z.string().min(1),
	complexitySignal: z.enum(["low", "medium", "high"]),
	frontierJustification: z.string().min(1).optional(),
});
export type ChangeMeta = z.infer<typeof ChangeMeta>;

// Fail closed: throws on invalid JSON or schema mismatch.
export function parseChangeMeta(input: string): ChangeMeta {
	let raw: unknown;
	try {
		raw = JSON.parse(input);
	} catch {
		throw new Error("change meta is not valid JSON");
	}
	return ChangeMeta.parse(raw);
}

export function serializeChangeMeta(meta: ChangeMeta): string {
	return JSON.stringify(ChangeMeta.parse(meta), null, 2);
}

export function changeMetaPath(changeDir: string): string {
	return join(changeDir, META_FILENAME);
}

export async function writeChangeMeta(
	changeDir: string,
	meta: ChangeMeta,
): Promise<void> {
	await Bun.write(changeMetaPath(changeDir), `${serializeChangeMeta(meta)}\n`);
}

// Fail closed: throws if the file is absent or does not validate.
export async function readChangeMeta(changeDir: string): Promise<ChangeMeta> {
	const file = Bun.file(changeMetaPath(changeDir));
	if (!(await file.exists())) {
		throw new Error(`no ${META_FILENAME} in ${changeDir}`);
	}
	return parseChangeMeta(await file.text());
}

if (import.meta.main) {
	const mode = process.argv[2];
	if (mode === "write") {
		const [
			,
			,
			,
			changeDir,
			workItemKey,
			complexitySignal,
			frontierJustification,
		] = process.argv;
		if (!changeDir || !workItemKey || !complexitySignal) {
			console.error(
				"usage: change-meta write <changeDir> <workItemKey> <low|medium|high> [frontierJustification]",
			);
			process.exit(2);
		}
		const meta = ChangeMeta.parse({
			workItemKey,
			complexitySignal,
			...(frontierJustification ? { frontierJustification } : {}),
		});
		await writeChangeMeta(changeDir, meta);
		console.log(JSON.stringify(meta));
		process.exit(0);
	}
	if (mode === "read") {
		const changeDir = process.argv[3];
		if (!changeDir) {
			console.error("usage: change-meta read <changeDir>");
			process.exit(2);
		}
		try {
			console.log(JSON.stringify(await readChangeMeta(changeDir)));
			process.exit(0);
		} catch (e) {
			console.error(e instanceof Error ? e.message : String(e));
			process.exit(1);
		}
	}
	console.error("usage: change-meta <write|read> ...");
	process.exit(2);
}
