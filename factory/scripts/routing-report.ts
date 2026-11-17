import { join } from "node:path";
import { sanitizeHumanText } from "./human-text";
import { loadObservations } from "./record-routing";
import type { RoutingObservation } from "./routing-observation";
import type { ModelTier } from "./task-profile";

const RANK: Record<ModelTier, number> = {
	fast: 0,
	standard: 1,
	frontier: 2,
};

export type TierRelation = "cheaper" | "same" | "stronger";

export function tierRelation(
	current: ModelTier,
	shadow: ModelTier,
): TierRelation {
	if (RANK[shadow] < RANK[current]) return "cheaper";
	if (RANK[shadow] > RANK[current]) return "stronger";
	return "same";
}

export interface RoutingReport {
	taskCount: number;
	runCount: number;
	cheaperShadow: number;
	sameTier: number;
	strongerShadow: number;
	floorRaised: number;
	gatesPassed: number;
	repairs: number;
	escalations: number;
	tokenTasks: number;
	characterTasks: number;
	unavailableUsage: number;
	timedTasks: number;
	costTasks: number;
	byStage: Record<string, number>;
}

export function summariseObservations(
	observations: RoutingObservation[],
): RoutingReport {
	const runs = new Set(observations.map((item) => item.runId));
	const byStage: Record<string, number> = {};
	const report: RoutingReport = {
		taskCount: observations.length,
		runCount: runs.size,
		cheaperShadow: 0,
		sameTier: 0,
		strongerShadow: 0,
		floorRaised: 0,
		gatesPassed: 0,
		repairs: 0,
		escalations: 0,
		tokenTasks: 0,
		characterTasks: 0,
		unavailableUsage: 0,
		timedTasks: 0,
		costTasks: 0,
		byStage,
	};
	for (const item of observations) {
		const relation = tierRelation(item.currentTier, item.shadowTier);
		if (relation === "cheaper") report.cheaperShadow += 1;
		if (relation === "same") report.sameTier += 1;
		if (relation === "stronger") report.strongerShadow += 1;
		if (item.floorApplied) report.floorRaised += 1;
		if (item.currentOutcome.gatesPassed) report.gatesPassed += 1;
		report.repairs += item.currentOutcome.repairs;
		report.escalations += item.currentOutcome.escalations;
		if (item.context.usage.source === "tokens") report.tokenTasks += 1;
		else if (item.context.usage.source === "characters") {
			report.characterTasks += 1;
		} else report.unavailableUsage += 1;
		if (item.context.usage.wallTimeMs !== undefined) report.timedTasks += 1;
		if (item.context.usage.costUsd !== undefined) report.costTasks += 1;
		const stage = item.profile.stage;
		byStage[stage] = (byStage[stage] ?? 0) + 1;
	}
	return report;
}

export function formatRoutingReport(report: RoutingReport): string {
	const usageBits = [
		report.tokenTasks > 0
			? `${report.tokenTasks} with token counts`
			: undefined,
		report.characterTasks > 0
			? `${report.characterTasks} with character counts as a stand-in`
			: undefined,
		report.unavailableUsage > 0
			? `${report.unavailableUsage} without a token or character figure`
			: undefined,
		report.timedTasks > 0 ? `${report.timedTasks} with wall time` : undefined,
		report.costTasks > 0 ? `${report.costTasks} with cost` : undefined,
	].filter((bit): bit is string => Boolean(bit));
	const body = [
		`Compared ${report.taskCount} tasks from ${report.runCount} deliveries.`,
		`Live work stayed on the current models. Shadow recommendations would have used a cheaper model on ${report.cheaperShadow} tasks, the same capability on ${report.sameTier}, and a stronger model on ${report.strongerShadow}.`,
		`Routing floors raised ${report.floorRaised} recommendations above the first cheap proposal.`,
		`Gates passed on ${report.gatesPassed} of ${report.taskCount} tasks. Repairs: ${report.repairs}. Escalations: ${report.escalations}.`,
		usageBits.length > 0
			? `Context size and usage were recorded for every task (${usageBits.join("; ")}).`
			: "No usage figures were available.",
		"Fast models stay off until live evaluation of reversible, strongly verified work clears the 90 percent bar.",
	];
	return sanitizeHumanText(body.join("\n\n"));
}

if (import.meta.main) {
	const root = process.argv[2];
	if (!root) {
		console.error("usage: routing-report <routing-root> [out.json]");
		process.exit(2);
	}
	try {
		const observations = await loadObservations(root);
		const report = summariseObservations(observations);
		const text = formatRoutingReport(report);
		const out = process.argv[3];
		const payload = { report, text };
		if (out)
			await Bun.write(join(out), `${JSON.stringify(payload, null, 2)}\n`);
		await Bun.write(join(root, "report.md"), `${text}\n`);
		await Bun.write(
			join(root, "report.json"),
			`${JSON.stringify(payload, null, 2)}\n`,
		);
		console.log(JSON.stringify(payload));
	} catch (error) {
		console.error(error instanceof Error ? error.message : String(error));
		process.exit(1);
	}
}
