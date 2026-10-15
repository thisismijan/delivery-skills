import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	META_FILENAME,
	changeMetaPath,
	parseChangeMeta,
	readChangeMeta,
	serializeChangeMeta,
	writeChangeMeta,
} from "./change-meta";

test("parse round-trips a valid meta", () => {
	const meta = parseChangeMeta(
		JSON.stringify({
			jiraKey: "SMAI-123",
			complexitySignal: "high",
			opusJustification: "intricate locking",
		}),
	);
	expect(meta.jiraKey).toBe("SMAI-123");
	expect(meta.complexitySignal).toBe("high");
	expect(meta.opusJustification).toBe("intricate locking");
});

test("opusJustification is optional", () => {
	const meta = parseChangeMeta(
		JSON.stringify({ jiraKey: "SMAI-1", complexitySignal: "low" }),
	);
	expect(meta.complexitySignal).toBe("low");
	expect(meta.opusJustification).toBeUndefined();
});

test("fail closed on invalid JSON", () => {
	expect(() => parseChangeMeta("{not json")).toThrow();
});

test("fail closed on a bad complexitySignal", () => {
	expect(() =>
		parseChangeMeta(JSON.stringify({ jiraKey: "X", complexitySignal: "huge" })),
	).toThrow();
});

test("fail closed on a missing jiraKey", () => {
	expect(() =>
		parseChangeMeta(JSON.stringify({ complexitySignal: "low" })),
	).toThrow();
});

test("serialize then parse is stable", () => {
	const input = { jiraKey: "SMAI-9", complexitySignal: "medium" as const };
	expect(parseChangeMeta(serializeChangeMeta(input))).toEqual(input);
});

test("meta path is the committed dotfile in the change dir", () => {
	expect(changeMetaPath("openspec/changes/smai-1-x")).toBe(
		join("openspec/changes/smai-1-x", META_FILENAME),
	);
});

test("write then read round-trips through the change dir", async () => {
	const dir = await mkdtemp(join(tmpdir(), "change-meta-"));
	try {
		await writeChangeMeta(dir, {
			jiraKey: "SMAI-42",
			complexitySignal: "high",
			opusJustification: "cross-cutting refactor",
		});
		const meta = await readChangeMeta(dir);
		expect(meta.jiraKey).toBe("SMAI-42");
		expect(meta.complexitySignal).toBe("high");
		expect(meta.opusJustification).toBe("cross-cutting refactor");
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
});

test("read fails closed when the meta file is absent", async () => {
	const dir = await mkdtemp(join(tmpdir(), "change-meta-"));
	try {
		await expect(readChangeMeta(dir)).rejects.toThrow();
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
});
