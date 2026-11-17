import { join } from "node:path";
import { z } from "zod";

// Draft writes this file into the change folder and commits it with the spec,
// so /execute picks its implementation model from the complexity Draft
// recorded rather than asking a model to estimate it again.
export const META_FILENAME = ".delivery.json";

const COMPLEXITY = ["low", "medium", "high"] as const;

export const ChangeMeta = z.object({
	workItemKey: z.string().min(1),
	complexitySignal: z.enum(COMPLEXITY),
	frontierJustification: z.string().min(1).optional(),
	// Paths feasibility expected the build to touch; /execute reports any
	// changed file that falls outside them.
	affectedAreas: z.array(z.string().min(1)).optional(),
});
export type ChangeMeta = z.output<typeof ChangeMeta>;

export function parseChangeMeta(text: string): ChangeMeta {
	let decoded: unknown;
	try {
		decoded = JSON.parse(text);
	} catch {
		throw new Error("change meta is not valid JSON");
	}
	return ChangeMeta.parse(decoded);
}

export function serializeChangeMeta(value: ChangeMeta): string {
	const checked = ChangeMeta.parse(value);
	return JSON.stringify(checked, null, 2);
}

export function changeMetaPath(dir: string): string {
	return join(dir, META_FILENAME);
}

export async function writeChangeMeta(
	dir: string,
	meta: ChangeMeta,
): Promise<void> {
	const text = `${serializeChangeMeta(meta)}\n`;
	await Bun.write(changeMetaPath(dir), text);
}

export async function readChangeMeta(dir: string): Promise<ChangeMeta> {
	const handle = Bun.file(changeMetaPath(dir));
	if (await handle.exists()) return parseChangeMeta(await handle.text());
	throw new Error(`no ${META_FILENAME} in ${dir}`);
}

const WRITE_USAGE =
	"usage: change-meta write <changeDir> <workItemKey> <low|medium|high> [frontierJustification] [--areas <json-array>]";
const READ_USAGE = "usage: change-meta read <changeDir>";

function usage(text: string): never {
	console.error(text);
	process.exit(2);
}

// Pulls `--areas <json>` out of the argument list wherever it appears.
function takeAreas(args: string[]): { rest: string[]; areas?: string } {
	const flag = args.indexOf("--areas");
	if (flag < 0) return { rest: args };
	const rest = [...args.slice(0, flag), ...args.slice(flag + 2)];
	const areas = args[flag + 1];
	if (!areas) usage(WRITE_USAGE);
	return { rest, areas };
}

async function writeCommand(args: string[]): Promise<void> {
	const { rest, areas } = takeAreas(args);
	const [changeDir, workItemKey, complexitySignal, justification] = rest;
	if (!changeDir || !workItemKey || !complexitySignal) usage(WRITE_USAGE);
	let affectedAreas: unknown;
	if (areas !== undefined) {
		try {
			affectedAreas = JSON.parse(areas);
		} catch {
			usage("--areas is not a JSON array of paths");
		}
	}
	const meta = ChangeMeta.parse({
		workItemKey,
		complexitySignal,
		...(justification ? { frontierJustification: justification } : {}),
		...(affectedAreas === undefined ? {} : { affectedAreas }),
	});
	await writeChangeMeta(changeDir, meta);
	console.log(JSON.stringify(meta));
}

async function readCommand(changeDir: string | undefined): Promise<void> {
	if (!changeDir) usage(READ_USAGE);
	const meta = await readChangeMeta(changeDir);
	console.log(JSON.stringify(meta));
}

if (import.meta.main) {
	const [mode, ...args] = process.argv.slice(2);
	if (mode !== "write" && mode !== "read") {
		usage("usage: change-meta <write|read> ...");
	}
	try {
		if (mode === "write") await writeCommand(args);
		else await readCommand(args[0]);
	} catch (error) {
		console.error(error instanceof Error ? error.message : String(error));
		process.exit(1);
	}
	process.exit(0);
}
