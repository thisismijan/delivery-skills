export type PipelinePhase = "change" | "default-branch";
export type PipelineAttribution =
	| "attributable"
	| "transient"
	| "unrelated"
	| "unknown";
export type PipelineAction = "proceed" | "wait" | "fix-forward" | "escalate";

export interface PipelineRouteInput {
	phase: PipelinePhase;
	available: boolean;
	status?: string;
	current: boolean;
	attribution?: PipelineAttribution;
	attempt: number;
	maxAttempts: number;
	withinApprovedScope: boolean;
}

export interface PipelineRoute {
	action: PipelineAction;
	reason: string;
}

const SUCCESS = new Set(["success", "passed", "neutral", "skipped"]);
const RUNNING = new Set([
	"created",
	"requested",
	"queued",
	"pending",
	"preparing",
	"running",
	"in_progress",
	"waiting_for_resource",
]);

export function routePipeline(input: PipelineRouteInput): PipelineRoute {
	if (!input.available) {
		return {
			action: "wait",
			reason: "Pipeline evidence is not available for the exact revision yet.",
		};
	}
	if (!input.current) {
		return {
			action: "wait",
			reason: "Pipeline evidence belongs to a different revision.",
		};
	}
	const status = input.status?.trim().toLowerCase() ?? "";
	if (SUCCESS.has(status)) {
		return {
			action: "proceed",
			reason: "Pipeline passed at the exact revision.",
		};
	}
	if (!status || RUNNING.has(status)) {
		return {
			action: "wait",
			reason: "Pipeline is still running at the exact revision.",
		};
	}
	if (input.attribution !== "attributable") {
		return {
			action: "escalate",
			reason:
				input.attribution === "transient"
					? "The failure appears transient, but retrying CI is not a portable forge operation."
					: input.attribution === "unrelated"
						? "The failure is unrelated to this change."
						: "The failure cannot be attributed safely.",
		};
	}
	if (!input.withinApprovedScope) {
		return {
			action: "escalate",
			reason: "The repair would exceed the approved run contract.",
		};
	}
	if (input.attempt >= input.maxAttempts) {
		return {
			action: "escalate",
			reason: "The bounded fix-forward budget is exhausted.",
		};
	}
	return {
		action: "fix-forward",
		reason:
			input.phase === "change"
				? "Fix the attributable failure on the open change, then rerun every invalidated gate."
				: "Create a new reviewed recovery change for the attributable default-branch failure.",
	};
}

if (import.meta.main) {
	try {
		const input = JSON.parse(process.argv[2] ?? "") as PipelineRouteInput;
		console.log(JSON.stringify(routePipeline(input), null, 2));
	} catch (error) {
		console.error(error instanceof Error ? error.message : String(error));
		process.exit(2);
	}
}
