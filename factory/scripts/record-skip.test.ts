import { expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadObservations } from "./record-routing";
import {
	SKIPPED_WORKERS,
	buildSkippedDispatch,
	loadSkips,
	parseSkipInput,
	persistSkipBatch,
} from "./record-skip";

const skip = {
	skipId: "mechanical-test-writer",
	worker: "test-writer" as const,
	reason: "mechanical-edit apply is script",
};

test("persist stores a skip without token or cost fields", async () => {
	const dir = await mkdtemp(join(tmpdir(), "record-skip-"));
	try {
		const paths = await persistSkipBatch(dir, "change-one", {
			skips: [
				skip,
				{ ...skip, skipId: "mechanical-implementer", worker: "implementer" },
			],
		});
		expect(paths).toHaveLength(2);
		const loaded = await loadSkips(dir);
		expect(loaded.map((item) => item.worker).sort()).toEqual([
			"implementer",
			"test-writer",
		]);
		expect(loaded[0]).not.toHaveProperty("inputTokens");
		expect(loaded[0]).not.toHaveProperty("costUsd");
		expect(await loadObservations(dir)).toEqual([]);
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
});

test("a duplicate skip id is refused", async () => {
	const dir = await mkdtemp(join(tmpdir(), "record-skip-dup-"));
	try {
		await persistSkipBatch(dir, "change-one", skip);
		await expect(persistSkipBatch(dir, "change-one", skip)).rejects.toThrow(
			"skip id already recorded",
		);
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
});

test("an unknown worker is refused", () => {
	expect(() =>
		parseSkipInput({ skipId: "x", worker: "composer", reason: "no" }),
	).toThrow();
	expect(SKIPPED_WORKERS).toContain("comment-assessor");
});

test("a hostile skip id cannot escape the run directory", async () => {
	const dir = await mkdtemp(join(tmpdir(), "record-skip-hostile-"));
	try {
		await expect(
			persistSkipBatch(dir, "change-one", {
				skipId: "../escape",
				worker: "test-writer",
				reason: "no",
			}),
		).rejects.toThrow("expected a simple file-safe name");
		expect(await Bun.file(join(dir, "escape.json")).exists()).toBe(false);
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
});

test("the CLI persists a skip batch", async () => {
	const dir = await mkdtemp(join(tmpdir(), "record-skip-cli-"));
	try {
		const input = join(dir, "skips.json");
		await writeFile(input, `${JSON.stringify({ skips: [skip] })}\n`);
		const proc = Bun.spawn(
			[
				"bun",
				join(import.meta.dir, "record-skip.ts"),
				"persist",
				dir,
				"change-one",
				input,
			],
			{ stdout: "pipe", stderr: "pipe" },
		);
		expect(await proc.exited).toBe(0);
		const loaded = await loadSkips(dir);
		expect(loaded).toHaveLength(1);
		expect(loaded[0]?.reason).toBe("mechanical-edit apply is script");
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
});

test("buildSkippedDispatch strips dashes from the reason", () => {
	const record = buildSkippedDispatch({
		runId: "change-one",
		skip: { ...skip, reason: "scripted — no worker" },
		recordedAt: "2026-10-28T15:00:00.000Z",
	});
	expect(record.reason).toBe("scripted - no worker");
});
