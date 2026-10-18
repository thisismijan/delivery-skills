import { expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { byteLength, captureUsage, startUsageTimer } from "./capture-usage";

test("a timer always records wall time even when tokens are unavailable", () => {
	const usage = captureUsage({
		timer: { startedAt: "2026-10-18T09:00:00.000Z", startedMs: 1_000 },
		endedMs: 1_450,
	});
	expect(usage).toMatchObject({
		source: "unavailable",
		wallTimeMs: 450,
		startedAt: "2026-10-18T09:00:00.000Z",
	});
	expect(usage.endedAt).toBeDefined();
	expect(usage.inputTokens).toBeUndefined();
	expect(usage.costUsd).toBeUndefined();
});

test("host tokens and cost overlay the automatic character stand-in", () => {
	const usage = captureUsage({
		timer: startUsageTimer(10),
		endedMs: 40,
		host: { inputTokens: 12, outputTokens: 3, costUsd: 0.02 },
		inputs: ["brief"],
		outputs: ["verdict"],
	});
	expect(usage.source).toBe("tokens");
	expect(usage.inputTokens).toBe(12);
	expect(usage.outputTokens).toBe(3);
	expect(usage.costUsd).toBe(0.02);
	expect(usage.inputChars).toBe(byteLength("brief"));
	expect(usage.outputChars).toBe(byteLength("verdict"));
	expect(usage.wallTimeMs).toBe(30);
});

test("named artifacts become a labelled character stand-in", () => {
	const usage = captureUsage({
		timer: startUsageTimer(0),
		endedMs: 5,
		inputs: ["abc"],
		outputs: ["de"],
	});
	expect(usage.source).toBe("characters");
	expect(usage.inputChars).toBe(3);
	expect(usage.outputChars).toBe(2);
	expect(usage.inputTokens).toBeUndefined();
});

test("host metrics cannot invent tokens from an empty object", () => {
	expect(() =>
		captureUsage({
			timer: startUsageTimer(0),
			endedMs: 1,
			host: { inputTokens: -1 },
		}),
	).toThrow();
});

test("the CLI starts a timer, then writes tokens, cost, and wall time", async () => {
	const dir = await mkdtemp(join(tmpdir(), "capture-usage-"));
	try {
		const timerFile = join(dir, "timer.json");
		const hostFile = join(dir, "host.json");
		const inputFile = join(dir, "in.txt");
		const outputFile = join(dir, "out.txt");
		const usageFile = join(dir, "usage.json");
		const start = Bun.spawn(
			["bun", join(import.meta.dir, "capture-usage.ts"), "start", timerFile],
			{ stdout: "pipe", stderr: "pipe" },
		);
		expect(await start.exited).toBe(0);
		await writeFile(hostFile, JSON.stringify({ inputTokens: 9, costUsd: 0.1 }));
		await writeFile(inputFile, "hello");
		await writeFile(outputFile, "world!");
		const finish = Bun.spawn(
			[
				"bun",
				join(import.meta.dir, "capture-usage.ts"),
				"finish",
				timerFile,
				usageFile,
				"--host",
				hostFile,
				"--input",
				inputFile,
				"--output",
				outputFile,
			],
			{ stdout: "pipe", stderr: "pipe" },
		);
		expect(await finish.exited).toBe(0);
		const usage = (await Bun.file(usageFile).json()) as {
			source: string;
			inputTokens: number;
			costUsd: number;
			wallTimeMs: number;
			inputChars: number;
			outputChars: number;
		};
		expect(usage.source).toBe("tokens");
		expect(usage.inputTokens).toBe(9);
		expect(usage.costUsd).toBe(0.1);
		expect(usage.wallTimeMs).toBeGreaterThanOrEqual(0);
		expect(usage.inputChars).toBe(5);
		expect(usage.outputChars).toBe(6);
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
});
