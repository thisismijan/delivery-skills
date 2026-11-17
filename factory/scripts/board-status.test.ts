import { describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BOARD_MAP_RELATIVE_PATH, readBoardMap } from "./board-map";
import {
	confirmBoardMap,
	interpretBoard,
	planBoardMove,
	proposeBoardMap,
	syncBoardStatus,
} from "./board-status";
import { defaultRuntimeManifest } from "./runtime-manifest";
import { configureWorkItemProvider } from "./work-item-config";
import {
	LOCAL_BOARD_STATUSES,
	WorkItemBoard,
	createLocalWorkItem,
	runWorkItemOperation,
} from "./work-item-provider";

const script = join(import.meta.dir, "board-status.ts");
const approval = {
	who: "operator",
	words: "yes, use that board map",
	at: "2026-10-29T10:00:00.000Z",
};

async function withRoot(fn: (root: string) => Promise<void>): Promise<void> {
	const root = await mkdtemp(join(tmpdir(), "board-status-"));
	try {
		await fn(root);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
}

async function localRepository(root: string) {
	const runtime = defaultRuntimeManifest(true);
	await configureWorkItemProvider({
		repositoryRoot: root,
		providerId: "local-files",
		runtime,
	});
	await createLocalWorkItem(root, {
		approved: true,
		auditId: "run-1:1",
		ref: "LOCAL-1",
		title: "Show spend by repository",
		body: "Group spend by repository on the costs page.",
	});
	return runtime;
}

function localMap(phases: Record<string, string>) {
	return {
		version: 1,
		provider: "local-files",
		statuses: [...LOCAL_BOARD_STATUSES],
		phases,
		approval,
	};
}

function board(current: string | null, statuses: string[]): WorkItemBoard {
	return WorkItemBoard.parse({
		version: 1,
		provider: "jira",
		ref: "DEL-1",
		current,
		statuses,
	});
}

describe("interpretBoard", () => {
	test("maps a standard board to the four phases", () => {
		expect(
			interpretBoard([
				"Backlog",
				"To Do",
				"In Progress",
				"Code Review",
				"Done",
			]),
		).toEqual({
			phases: {
				ready: "To Do",
				"in-progress": "In Progress",
				"in-review": "Code Review",
				done: "Done",
			},
			unresolved: [],
			ambiguous: [],
		});
	});

	test("leaves an ambiguous column for the operator", () => {
		const result = interpretBoard([
			"To Do",
			"In Progress",
			"Ready for Review",
			"Done",
		]);
		expect(result.ambiguous).toEqual(["Ready for Review"]);
		expect(Object.values(result.phases)).not.toContain("Ready for Review");
		expect(result.phases["in-review"]).toBeUndefined();
	});

	test("lists a phase with two candidate columns as unresolved", () => {
		const result = interpretBoard([
			"To Do",
			"In Progress",
			"QA",
			"Code Review",
			"Done",
		]);
		expect(result.unresolved).toEqual([
			{ phase: "in-review", candidates: ["QA", "Code Review"] },
		]);
		expect(result.phases["in-review"]).toBeUndefined();
	});

	test("refuses columns out of phase order", () => {
		const result = interpretBoard(["To Do", "Done", "In Progress"]);
		expect(result.phases).toEqual({});
		expect(result.problem).toMatch(/Choose the columns by hand/);
	});
});

describe("planBoardMove", () => {
	const map = {
		version: 1 as const,
		provider: "jira",
		statuses: ["To Do", "In Progress", "In Review", "Done"],
		phases: {
			ready: "To Do",
			"in-progress": "In Progress",
			"in-review": "In Review",
			done: "Done",
		},
		approval,
	};

	test("moves a ticket forward", () => {
		expect(
			planBoardMove({
				map,
				board: board("To Do", map.statuses),
				phase: "in-progress",
			}),
		).toEqual({ action: "transition", from: "To Do", to: "In Progress" });
		expect(
			planBoardMove({ map, board: board(null, map.statuses), phase: "ready" }),
		).toEqual({ action: "transition", from: null, to: "To Do" });
	});

	test("never moves a ticket backwards or in place", () => {
		for (const current of ["In Progress", "In Review"]) {
			const move = planBoardMove({
				map,
				board: board(current, map.statuses),
				phase: "ready",
			});
			expect(move.action).toBe("skip");
		}
		expect(
			planBoardMove({ map, board: board("Done", map.statuses), phase: "done" })
				.action,
		).toBe("skip");
	});

	test("skips without a map, an unmapped phase, a changed board, or an unknown column", () => {
		expect(
			planBoardMove({
				map: undefined,
				board: board(null, map.statuses),
				phase: "ready",
			}),
		).toMatchObject({
			action: "skip",
			reason: expect.stringMatching(/no confirmed board map/),
		});
		expect(
			planBoardMove({
				map: { ...map, phases: { ready: "To Do" } },
				board: board("To Do", map.statuses),
				phase: "done",
			}),
		).toMatchObject({
			action: "skip",
			reason: expect.stringMatching(/no column for the done phase/),
		});
		expect(
			planBoardMove({
				map,
				board: board("To Do", [...map.statuses, "Blocked"]),
				phase: "in-progress",
			}),
		).toMatchObject({
			action: "skip",
			reason: expect.stringMatching(/Confirm the map again/),
		});
		expect(
			planBoardMove({
				map,
				board: board("Blocked", map.statuses),
				phase: "in-progress",
			}),
		).toMatchObject({
			action: "skip",
			reason: expect.stringMatching(/does not know/),
		});
	});
});

describe("board map confirmation", () => {
	test("refuses a map without approval and writes nothing", async () => {
		await withRoot(async (root) => {
			await localRepository(root);
			const { approval: _omitted, ...unapproved } = localMap({
				ready: "To Do",
			});
			await expect(confirmBoardMap(root, unapproved)).rejects.toThrow();
			expect(await readBoardMap(root)).toBeUndefined();
		});
	});

	test("refuses phases off the board, out of order, or for another provider", async () => {
		await withRoot(async (root) => {
			await localRepository(root);
			await expect(
				confirmBoardMap(root, localMap({ ready: "Backlog" })),
			).rejects.toThrow(/not a board column/);
			await expect(
				confirmBoardMap(root, localMap({ ready: "Done", done: "To Do" })),
			).rejects.toThrow(/must come after/);
			await expect(
				confirmBoardMap(root, {
					...localMap({ ready: "To Do" }),
					provider: "jira",
				}),
			).rejects.toThrow(/this repository uses 'local-files'/);
			expect(await readBoardMap(root)).toBeUndefined();
		});
	});

	test("the CLI confirms a proposed map and exits non-zero without approval", async () => {
		await withRoot(async (root) => {
			const runtime = await localRepository(root);
			const proposal = await proposeBoardMap({
				repositoryRoot: root,
				runtime,
				ref: "LOCAL-1",
			});
			expect(proposal.phases).toEqual({
				ready: "To Do",
				"in-progress": "In Progress",
				"in-review": "In Review",
				done: "Done",
			});
			const unapprovedPath = join(root, "unapproved.json");
			await writeFile(
				unapprovedPath,
				JSON.stringify({
					version: 1,
					provider: "local-files",
					statuses: proposal.statuses,
					phases: proposal.phases,
				}),
			);
			const refused = Bun.spawnSync([
				"bun",
				script,
				"confirm",
				root,
				unapprovedPath,
			]);
			expect(refused.exitCode).toBe(1);
			expect(await readBoardMap(root)).toBeUndefined();
			const mapPath = join(root, "map.json");
			await writeFile(
				mapPath,
				JSON.stringify({
					version: 1,
					provider: "local-files",
					statuses: proposal.statuses,
					phases: proposal.phases,
					approval,
				}),
			);
			const confirmed = Bun.spawnSync([
				"bun",
				script,
				"confirm",
				root,
				mapPath,
			]);
			expect(confirmed.exitCode).toBe(0);
			expect(confirmed.stdout.toString()).toContain(
				"Board map confirmed for local-files",
			);
			expect(
				JSON.parse(await readFile(join(root, BOARD_MAP_RELATIVE_PATH), "utf8"))
					.phases.ready,
			).toBe("To Do");
		});
	});
});

describe("syncBoardStatus on local files", () => {
	test("moves a ticket through every phase and never backwards", async () => {
		await withRoot(async (root) => {
			const runtime = await localRepository(root);
			await confirmBoardMap(
				root,
				localMap({
					ready: "To Do",
					"in-progress": "In Progress",
					"in-review": "In Review",
					done: "Done",
				}),
			);
			const sync = (phase: "ready" | "in-progress" | "in-review" | "done") =>
				syncBoardStatus({
					repositoryRoot: root,
					runtime,
					ref: "LOCAL-1",
					phase,
				});
			expect(await sync("ready")).toMatchObject({
				outcome: "moved",
				from: null,
				to: "To Do",
			});
			expect(await sync("in-progress")).toMatchObject({
				outcome: "moved",
				to: "In Progress",
			});
			expect(await sync("ready")).toMatchObject({ outcome: "skipped" });
			expect(await sync("in-review")).toMatchObject({
				outcome: "moved",
				to: "In Review",
			});
			expect(await sync("done")).toMatchObject({
				outcome: "moved",
				to: "Done",
			});
			const final = await runWorkItemOperation({
				operation: "statuses",
				repositoryRoot: root,
				runtime,
				input: { ref: "LOCAL-1" },
			});
			expect(final).toMatchObject({ current: "Done" });
		});
	});

	test("skips every phase and exits zero without a map", async () => {
		await withRoot(async (root) => {
			await localRepository(root);
			const manifest = join(root, "runtime.json");
			await writeFile(manifest, JSON.stringify(defaultRuntimeManifest(true)));
			const result = Bun.spawnSync([
				"bun",
				script,
				"sync",
				root,
				manifest,
				"LOCAL-1",
				"in-progress",
			]);
			expect(result.exitCode).toBe(0);
			expect(JSON.parse(result.stdout.toString())).toMatchObject({
				outcome: "skipped",
				reason: expect.stringMatching(/no confirmed board map/),
			});
		});
	});

	test("refuses an unknown phase", async () => {
		await withRoot(async (root) => {
			const manifest = join(root, "runtime.json");
			await writeFile(manifest, JSON.stringify(defaultRuntimeManifest(true)));
			const result = Bun.spawnSync([
				"bun",
				script,
				"sync",
				root,
				manifest,
				"LOCAL-1",
				"closed",
			]);
			expect(result.exitCode).toBe(1);
		});
	});
});

describe("the transition operation", () => {
	test("refuses unapproved input and targets outside the map before any provider runs", async () => {
		await withRoot(async (root) => {
			const runtime = await localRepository(root);
			const transition = (input: unknown) =>
				runWorkItemOperation({
					operation: "transition",
					repositoryRoot: root,
					runtime,
					input,
				});
			await expect(
				transition({ ref: "LOCAL-1", to: "In Progress" }),
			).rejects.toThrow();
			await expect(
				transition({ approved: true, ref: "LOCAL-1", to: "In Progress" }),
			).rejects.toThrow(/No confirmed board map/);
			await confirmBoardMap(root, localMap({ ready: "To Do" }));
			await expect(
				transition({ approved: true, ref: "LOCAL-1", to: "Done" }),
			).rejects.toThrow(
				/not a column the confirmed board map moves tickets to/,
			);
			expect(
				await runWorkItemOperation({
					operation: "statuses",
					repositoryRoot: root,
					runtime,
					input: { ref: "LOCAL-1" },
				}),
			).toMatchObject({ current: null });
		});
	});

	test("session tools never normalize a board result", async () => {
		const { normalizeWorkItemSessionResult } = await import(
			"./work-item-provider"
		);
		for (const operation of ["statuses", "transition"] as const) {
			expect(() =>
				normalizeWorkItemSessionResult({
					provider: "jira",
					operation,
					raw: {},
				}),
			).toThrow(/only through the work-item adapter/);
		}
	});
});
