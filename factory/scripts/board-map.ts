import { lstat, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { z } from "zod";
import { primaryCheckoutOf } from "./work-item-config";

export const BOARD_MAP_RELATIVE_PATH = ".delivery/board-status.json";

export const SDLC_BOARD_PHASES = [
	"ready",
	"in-progress",
	"in-review",
	"done",
] as const;
export const BoardPhase = z.enum(SDLC_BOARD_PHASES);
export type BoardPhase = z.infer<typeof BoardPhase>;

const ColumnName = z.string().trim().min(1).max(200);

export const BoardMap = z
	.object({
		version: z.literal(1),
		provider: z.string().trim().min(1),
		statuses: z.array(ColumnName).min(1),
		phases: z
			.object({
				ready: ColumnName.optional(),
				"in-progress": ColumnName.optional(),
				"in-review": ColumnName.optional(),
				done: ColumnName.optional(),
			})
			.strict(),
		approval: z
			.object({
				who: z.string().trim().min(1),
				words: z.string().trim().min(1),
				at: z.string().datetime(),
			})
			.strict(),
	})
	.strict()
	.superRefine((map, ctx) => {
		if (new Set(map.statuses).size !== map.statuses.length) {
			ctx.addIssue({
				code: "custom",
				path: ["statuses"],
				message: "board columns must be unique",
			});
		}
		const mapped = SDLC_BOARD_PHASES.filter((phase) => map.phases[phase]);
		if (mapped.length === 0) {
			ctx.addIssue({
				code: "custom",
				path: ["phases"],
				message: "the board map must map at least one phase",
			});
		}
		let previous = -1;
		const used = new Set<string>();
		for (const phase of mapped) {
			const column = map.phases[phase] as string;
			const index = map.statuses.indexOf(column);
			if (index < 0) {
				ctx.addIssue({
					code: "custom",
					path: ["phases", phase],
					message: `phase '${phase}' maps to '${column}', which is not a board column`,
				});
				continue;
			}
			if (used.has(column)) {
				ctx.addIssue({
					code: "custom",
					path: ["phases", phase],
					message: `column '${column}' is mapped to more than one phase`,
				});
			}
			used.add(column);
			if (index <= previous) {
				ctx.addIssue({
					code: "custom",
					path: ["phases", phase],
					message: `phase '${phase}' must come after the earlier phases on the board`,
				});
			}
			previous = Math.max(previous, index);
		}
	});
export type BoardMap = z.infer<typeof BoardMap>;

export function mappedColumns(map: BoardMap): string[] {
	return SDLC_BOARD_PHASES.flatMap((phase) => {
		const column = map.phases[phase];
		return column ? [column] : [];
	});
}

async function readMapFile(root: string): Promise<BoardMap | undefined> {
	const path = join(root, BOARD_MAP_RELATIVE_PATH);
	try {
		if ((await lstat(path)).isSymbolicLink()) {
			throw new Error("refusing to read a symlinked board map");
		}
		return BoardMap.parse(JSON.parse(await readFile(path, "utf8")));
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
		throw error;
	}
}

// A worktree inherits the map of the checkout it belongs to, like the work-item selection.
export async function readBoardMap(
	repositoryRoot: string,
): Promise<BoardMap | undefined> {
	const own = await readMapFile(repositoryRoot);
	if (own) return own;
	const primary = primaryCheckoutOf(repositoryRoot);
	return primary ? readMapFile(primary) : undefined;
}

export async function writeBoardMap(
	repositoryRoot: string,
	raw: unknown,
): Promise<BoardMap> {
	const map = BoardMap.parse(raw);
	const path = join(repositoryRoot, BOARD_MAP_RELATIVE_PATH);
	await mkdir(dirname(path), { recursive: true });
	const temporary = `${path}.${process.pid}.tmp`;
	await writeFile(temporary, `${JSON.stringify(map, null, 2)}\n`, {
		mode: 0o600,
	});
	await rename(temporary, path);
	return map;
}
