import { readFile } from "node:fs/promises";
import { z } from "zod";
import { type Usage, Usage as UsageSchema } from "./routing-observation";

export const UsageTimer = z.object({
	startedAt: z.string().min(1),
	startedMs: z.number().int().nonnegative(),
});
export type UsageTimer = z.infer<typeof UsageTimer>;

export const HostUsage = z
	.object({
		inputTokens: z.number().int().nonnegative().optional(),
		outputTokens: z.number().int().nonnegative().optional(),
		costUsd: z.number().nonnegative().optional(),
	})
	.strict();
export type HostUsage = z.infer<typeof HostUsage>;

export function startUsageTimer(nowMs = Date.now()): UsageTimer {
	return UsageTimer.parse({
		startedAt: new Date(nowMs).toISOString(),
		startedMs: nowMs,
	});
}

export function byteLength(contents: string | Uint8Array): number {
	return typeof contents === "string"
		? Buffer.byteLength(contents, "utf8")
		: contents.byteLength;
}

export function captureUsage(input: {
	timer: UsageTimer;
	endedMs?: number;
	host?: HostUsage;
	inputs?: Array<string | Uint8Array>;
	outputs?: Array<string | Uint8Array>;
}): Usage {
	const timer = UsageTimer.parse(input.timer);
	const endedMs = input.endedMs ?? Date.now();
	const wallTimeMs = Math.max(0, endedMs - timer.startedMs);
	const host = input.host ? HostUsage.parse(input.host) : undefined;
	const inputChars = (input.inputs ?? []).reduce(
		(sum, item) => sum + byteLength(item),
		0,
	);
	const outputChars = (input.outputs ?? []).reduce(
		(sum, item) => sum + byteLength(item),
		0,
	);
	const hasTokens =
		host?.inputTokens !== undefined || host?.outputTokens !== undefined;
	const hasChars =
		(input.inputs?.length ?? 0) > 0 || (input.outputs?.length ?? 0) > 0;
	const usage: Usage = {
		source: hasTokens ? "tokens" : hasChars ? "characters" : "unavailable",
		wallTimeMs,
		startedAt: timer.startedAt,
		endedAt: new Date(endedMs).toISOString(),
	};
	if (host?.inputTokens !== undefined) usage.inputTokens = host.inputTokens;
	if (host?.outputTokens !== undefined) usage.outputTokens = host.outputTokens;
	if (host?.costUsd !== undefined) usage.costUsd = host.costUsd;
	if (hasChars) {
		usage.inputChars = inputChars;
		usage.outputChars = outputChars;
	}
	return UsageSchema.parse(usage);
}

function takeFlag(args: string[], name: string): string | undefined {
	const index = args.indexOf(name);
	if (index < 0) return undefined;
	const value = args[index + 1];
	if (!value) {
		throw new Error(`${name} needs a path`);
	}
	args.splice(index, 2);
	return value;
}

function takeRepeat(args: string[], name: string): string[] {
	const values: string[] = [];
	let index = args.indexOf(name);
	while (index >= 0) {
		const value = args[index + 1];
		if (!value) throw new Error(`${name} needs a path`);
		values.push(value);
		args.splice(index, 2);
		index = args.indexOf(name);
	}
	return values;
}

if (import.meta.main) {
	const [command, ...rest] = process.argv.slice(2);
	try {
		if (command === "start") {
			const timerFile = rest[0];
			if (!timerFile || rest.length !== 1) {
				console.error("usage: capture-usage start <timer.json>");
				process.exit(2);
			}
			const timer = startUsageTimer();
			await Bun.write(timerFile, `${JSON.stringify(timer, null, 2)}\n`);
			console.log(
				JSON.stringify({ path: timerFile, startedAt: timer.startedAt }),
			);
			process.exit(0);
		}
		if (command === "finish") {
			const args = [...rest];
			const hostFile = takeFlag(args, "--host");
			const inputFiles = takeRepeat(args, "--input");
			const outputFiles = takeRepeat(args, "--output");
			const [timerFile, usageFile] = args;
			if (!timerFile || !usageFile || args.length !== 2) {
				console.error(
					"usage: capture-usage finish <timer.json> <usage.json> [--host host.json] [--input file]... [--output file]...",
				);
				process.exit(2);
			}
			const timer = UsageTimer.parse(await Bun.file(timerFile).json());
			const host = hostFile
				? HostUsage.parse(await Bun.file(hostFile).json())
				: undefined;
			const inputs = await Promise.all(
				inputFiles.map((path) => readFile(path)),
			);
			const outputs = await Promise.all(
				outputFiles.map((path) => readFile(path)),
			);
			const usage = captureUsage({ timer, host, inputs, outputs });
			await Bun.write(usageFile, `${JSON.stringify(usage, null, 2)}\n`);
			console.log(JSON.stringify({ path: usageFile, source: usage.source }));
			process.exit(0);
		}
		console.error(
			"usage: capture-usage start <timer.json> | finish <timer.json> <usage.json> [--host host.json] [--input file]... [--output file]...",
		);
		process.exit(2);
	} catch (error) {
		console.error(error instanceof Error ? error.message : String(error));
		process.exit(1);
	}
}
