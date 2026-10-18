import { join } from "node:path";
import { sanitizeHumanText } from "./human-text";
import { loadObservations } from "./record-routing";
import type { RoutingObservation } from "./routing-observation";
import { tierRelation } from "./routing-report";

export interface RunRoutingScorecard {
	runId: string;
	taskCount: number;
	actual: {
		gatesPassed: number;
		gatesFailed: number;
		repairs: number;
		escalations: number;
		wallTimeMs: number | null;
		costUsd: number | null;
		inputTokens: number | null;
		outputTokens: number | null;
		inputChars: number | null;
		outputChars: number | null;
	};
	shadow: {
		cheaper: number;
		sameTier: number;
		stronger: number;
		floorRaised: number;
		qualityStatus: "not-evaluated";
	};
}

function sumOptional(
	observations: RoutingObservation[],
	read: (item: RoutingObservation) => number | undefined,
): number | null {
	const values = observations
		.map(read)
		.filter((value): value is number => value !== undefined);
	return values.length === 0 ? null : values.reduce((sum, value) => sum + value, 0);
}

export function buildRunRoutingScorecard(
	observations: RoutingObservation[],
	runId: string,
): RunRoutingScorecard {
	const run = observations.filter((item) => item.runId === runId);
	if (run.length === 0) throw new Error(`no routing observations found for run ${runId}`);
	const relations = run.map((item) =>
		tierRelation(item.currentTier, item.shadowTier),
	);
	return {
		runId,
		taskCount: run.length,
		actual: {
			gatesPassed: run.filter((item) => item.currentOutcome.gatesPassed).length,
			gatesFailed: run.filter((item) => !item.currentOutcome.gatesPassed).length,
			repairs: run.reduce(
				(sum, item) => sum + item.currentOutcome.repairs,
				0,
			),
			escalations: run.reduce(
				(sum, item) => sum + item.currentOutcome.escalations,
				0,
			),
			wallTimeMs: sumOptional(run, (item) => item.context.usage.wallTimeMs),
			costUsd: sumOptional(run, (item) => item.context.usage.costUsd),
			inputTokens: sumOptional(run, (item) => item.context.usage.inputTokens),
			outputTokens: sumOptional(run, (item) => item.context.usage.outputTokens),
			inputChars: sumOptional(run, (item) => item.context.usage.inputChars),
			outputChars: sumOptional(run, (item) => item.context.usage.outputChars),
		},
		shadow: {
			cheaper: relations.filter((relation) => relation === "cheaper").length,
			sameTier: relations.filter((relation) => relation === "same").length,
			stronger: relations.filter((relation) => relation === "stronger").length,
			floorRaised: run.filter((item) => item.floorApplied).length,
			qualityStatus: "not-evaluated",
		},
	};
}

function displayOptional(value: number | null, suffix = ""): string {
	return value === null ? "not available" : `${value}${suffix}`;
}

export function formatRunRoutingScorecard(
	scorecard: RunRoutingScorecard,
): string {
	return sanitizeHumanText(
		[
			`# Routing scorecard for ${scorecard.runId}`,
			`Actual work: ${scorecard.taskCount} tasks; ${scorecard.actual.gatesPassed} passed gates; ${scorecard.actual.gatesFailed} failed gates; ${scorecard.actual.repairs} repairs; ${scorecard.actual.escalations} escalations.`,
			`Measured usage: ${displayOptional(scorecard.actual.wallTimeMs, " ms")} wall time; ${displayOptional(scorecard.actual.costUsd, " USD")} cost; ${displayOptional(scorecard.actual.inputTokens)} input tokens; ${displayOptional(scorecard.actual.outputTokens)} output tokens; ${displayOptional(scorecard.actual.inputChars)} input characters; ${displayOptional(scorecard.actual.outputChars)} output characters.`,
			`Shadow routing: ${scorecard.shadow.cheaper} cheaper, ${scorecard.shadow.sameTier} same capability, ${scorecard.shadow.stronger} stronger; ${scorecard.shadow.floorRaised} recommendations raised by a safety floor.`,
			"Shadow quality and savings are not evaluated by this scorecard because the shadow model did not run. Use a paired benchmark before promoting a cheaper model.",
		].join("\n\n"),
	);
}

if (import.meta.main) {
	const [root, runId] = process.argv.slice(2);
	if (!root || !runId) {
		console.error("usage: routing-scorecard <routing-root> <run-id>");
		process.exit(2);
	}
	try {
		const scorecard = buildRunRoutingScorecard(
			await loadObservations(root),
			runId,
		);
		const text = formatRunRoutingScorecard(scorecard);
		const runRoot = join(root, runId);
		await Bun.write(
			join(runRoot, "scorecard.json"),
			`${JSON.stringify(scorecard, null, 2)}\n`,
		);
		await Bun.write(join(runRoot, "scorecard.md"), `${text}\n`);
		console.log(JSON.stringify({ scorecard: join(runRoot, "scorecard.md") }));
	} catch (error) {
		console.error(error instanceof Error ? error.message : String(error));
		process.exit(1);
	}
}
