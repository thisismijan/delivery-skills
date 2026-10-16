import { mkdir, readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import {
	type CurrentOutcome,
	type RoutingObservation,
	UNAVAILABLE_USAGE,
	type Usage,
	parseRoutingObservation,
} from "./routing-observation";
import { shadowRoute } from "./shadow-route";
import type { LiveModel as LiveModelName } from "./task-profile";
import {
	LiveModel,
	type TaskProfileInput,
	TaskProfileInput as TaskProfileInputSchema,
} from "./task-profile";

const SAFE_SEGMENT = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/;

export function routingRoot(repoRoot: string): string {
	return join(repoRoot, ".delivery", "routing");
}

export function observationPath(
	root: string,
	runId: string,
	taskId: string,
): string {
	if (!SAFE_SEGMENT.test(runId) || !SAFE_SEGMENT.test(taskId)) {
		throw new Error("run id and task id must be simple file-safe names");
	}
	return join(root, runId, `${taskId}.json`);
}

export function buildObservation(input: {
	runId: string;
	profile: TaskProfileInput;
	currentModel: LiveModelName;
	outcome: CurrentOutcome;
	usage?: Usage;
	source?: RoutingObservation["source"];
	recordedAt?: string;
	controllerModel?: string;
	currentModelId?: string;
}): RoutingObservation {
	const profile = TaskProfileInputSchema.parse(input.profile);
	const decision = shadowRoute(profile, input.currentModel);
	return parseRoutingObservation({
		...decision,
		version: 1,
		runId: input.runId,
		recordedAt: input.recordedAt ?? new Date().toISOString(),
		source: input.source ?? "live",
		...(input.currentModelId ? { currentModelId: input.currentModelId } : {}),
		controller: {
			kind: input.controllerModel ? "frontier-readonly" : "opus-readonly",
			agent: "task-profile-controller",
			...(input.controllerModel ? { model: input.controllerModel } : {}),
		},
		context: {
			size: profile.contextSize,
			usage: input.usage ?? UNAVAILABLE_USAGE,
		},
		currentOutcome: input.outcome,
	});
}

export async function persistObservation(
	root: string,
	observation: RoutingObservation,
): Promise<string> {
	const parsed = parseRoutingObservation(observation);
	const path = observationPath(root, parsed.runId, parsed.profile.taskId);
	await mkdir(join(root, parsed.runId), { recursive: true });
	await Bun.write(path, `${JSON.stringify(parsed, null, 2)}\n`);
	return path;
}

export async function loadObservations(
	root: string,
): Promise<RoutingObservation[]> {
	const runs = await readdir(root, { withFileTypes: true }).catch(() => []);
	const found: RoutingObservation[] = [];
	for (const run of runs) {
		if (!run.isDirectory() || run.name === "corpus") continue;
		const files = await readdir(join(root, run.name));
		for (const file of files) {
			if (!file.endsWith(".json") || file === "report.json") continue;
			const raw = JSON.parse(
				await readFile(join(root, run.name, file), "utf8"),
			) as unknown;
			found.push(parseRoutingObservation(raw));
		}
	}
	return found.sort((a, b) => a.recordedAt.localeCompare(b.recordedAt));
}

if (import.meta.main) {
	const [
		command,
		root,
		runId,
		profileFile,
		modelArg,
		outcomeFile,
		usageFile,
		controllerModel,
		currentModelId,
	] = process.argv.slice(2);
	if (command !== "persist" || !root || !runId || !profileFile || !modelArg) {
		console.error(
			"usage: record-routing persist <routing-root> <run-id> <profile.json> <sonnet|opus> <outcome.json> [usage.json] [controller-model] [current-model-id]",
		);
		process.exit(2);
	}
	try {
		const profile = TaskProfileInputSchema.parse(
			await Bun.file(profileFile).json(),
		);
		const currentModel = LiveModel.parse(modelArg);
		const outcome = outcomeFile
			? ((await Bun.file(outcomeFile).json()) as CurrentOutcome)
			: {
					gates: [],
					gatesPassed: true,
					repairs: 0,
					escalations: 0,
					terminal: "continue" as const,
				};
		const usage = usageFile
			? ((await Bun.file(usageFile).json()) as Usage)
			: UNAVAILABLE_USAGE;
		const observation = buildObservation({
			runId,
			profile,
			currentModel,
			outcome,
			usage,
			controllerModel,
			currentModelId,
		});
		const path = await persistObservation(root, observation);
		console.log(JSON.stringify({ path, shadowTier: observation.shadowTier }));
	} catch (error) {
		console.error(error instanceof Error ? error.message : String(error));
		process.exit(1);
	}
}
