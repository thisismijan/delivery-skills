import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	type ChangeMeta,
	META_FILENAME,
	changeMetaPath,
	parseChangeMeta,
	readChangeMeta,
	serializeChangeMeta,
	writeChangeMeta,
} from "./change-meta";

const dirs: string[] = [];

async function scratch(): Promise<string> {
	const made = await mkdtemp(join(tmpdir(), "change-meta-"));
	dirs.push(made);
	return made;
}

afterEach(async () => {
	for (const dir of dirs.splice(0)) {
		await rm(dir, { recursive: true, force: true });
	}
});

function cli(...args: string[]) {
	const run = Bun.spawnSync(
		["bun", join(import.meta.dir, "change-meta.ts"), ...args],
		{ stdout: "pipe", stderr: "pipe", env: process.env },
	);
	return { code: run.exitCode, stdout: run.stdout.toString() };
}

describe("parseChangeMeta", () => {
	test("returns every field of a valid document", () => {
		const text = JSON.stringify({
			workItemKey: "XYZ-123",
			complexitySignal: "high",
			frontierJustification: "intricate locking",
		});
		expect(parseChangeMeta(text)).toEqual({
			workItemKey: "XYZ-123",
			complexitySignal: "high",
			frontierJustification: "intricate locking",
		});
	});

	test("accepts a document without a frontier justification", () => {
		const text = JSON.stringify({
			workItemKey: "XYZ-1",
			complexitySignal: "low",
		});
		const meta = parseChangeMeta(text);
		expect(meta.complexitySignal).toBe("low");
		expect(meta.frontierJustification).toBeUndefined();
	});

	test.each([
		["text that is not JSON", "{not json"],
		[
			"an unknown complexity signal",
			JSON.stringify({ workItemKey: "X", complexitySignal: "huge" }),
		],
		["a missing work item key", JSON.stringify({ complexitySignal: "low" })],
	])("throws on %s", (_label, text) => {
		expect(() => parseChangeMeta(text)).toThrow();
	});

	test("reads back exactly what serializeChangeMeta wrote", () => {
		const meta: ChangeMeta = {
			workItemKey: "XYZ-9",
			complexitySignal: "medium",
		};
		expect(parseChangeMeta(serializeChangeMeta(meta))).toEqual(meta);
	});
});

describe("the metadata file", () => {
	test("lives in the change folder under META_FILENAME", () => {
		const dir = "openspec/changes/xyz-1-x";
		expect(changeMetaPath(dir)).toBe(join(dir, META_FILENAME));
	});

	test("written then read gives back the same metadata", async () => {
		const dir = await scratch();
		const meta: ChangeMeta = {
			workItemKey: "XYZ-42",
			complexitySignal: "high",
			frontierJustification: "cross-cutting refactor",
		};
		await writeChangeMeta(dir, meta);
		expect(await readChangeMeta(dir)).toEqual(meta);
	});

	test("reading a folder without one rejects", async () => {
		const reading = readChangeMeta(await scratch());
		await expect(reading).rejects.toThrow();
	});
});

describe("the command line", () => {
	test("write stores --areas and a later write without it drops them", async () => {
		const dir = await scratch();
		const areas = '["src/a.ts","src/b"]';
		expect(cli("write", dir, "WORK-1", "medium", "--areas", areas).code).toBe(
			0,
		);
		expect((await readChangeMeta(dir)).affectedAreas).toEqual([
			"src/a.ts",
			"src/b",
		]);
		expect(cli("write", dir, "WORK-1", "low").code).toBe(0);
		expect((await readChangeMeta(dir)).affectedAreas).toBeUndefined();
	});

	test.each([
		["--areas that is not JSON", ["--areas", "not json"]],
		["--areas with no value", ["--areas"]],
	])("write exits 2 for %s", async (_label, extra) => {
		const dir = await scratch();
		expect(cli("write", dir, "WORK-1", "low", ...extra).code).toBe(2);
	});

	test("read prints the stored metadata", async () => {
		const dir = await scratch();
		await writeChangeMeta(dir, {
			workItemKey: "WORK-2",
			complexitySignal: "low",
		});
		const run = cli("read", dir);
		expect(run.code).toBe(0);
		expect(JSON.parse(run.stdout)).toEqual({
			workItemKey: "WORK-2",
			complexitySignal: "low",
		});
	});

	test("read exits 1 when the folder has no metadata", async () => {
		expect(cli("read", await scratch()).code).toBe(1);
	});

	test.each([[[]], [["write"]], [["read"]], [["other"]]])(
		"%j exits 2 with usage",
		(args) => {
			expect(cli(...args).code).toBe(2);
		},
	);
});
