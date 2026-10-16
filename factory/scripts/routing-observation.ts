import { z } from "zod";
import { ShadowDecision } from "./shadow-route";
import { TaskProfile } from "./task-profile";

export const Usage = z
	.object({
		source: z.enum(["tokens", "characters", "unavailable"]),
		inputTokens: z.number().int().nonnegative().optional(),
		outputTokens: z.number().int().nonnegative().optional(),
		inputChars: z.number().int().nonnegative().optional(),
		outputChars: z.number().int().nonnegative().optional(),
	})
	.superRefine((usage, ctx) => {
		if (
			usage.source === "tokens" &&
			usage.inputTokens === undefined &&
			usage.outputTokens === undefined
		) {
			ctx.addIssue({
				code: "custom",
				path: ["source"],
				message: "token usage must include at least one token count",
			});
		}
		if (
			usage.source === "characters" &&
			usage.inputChars === undefined &&
			usage.outputChars === undefined
		) {
			ctx.addIssue({
				code: "custom",
				path: ["source"],
				message: "character usage must include at least one character count",
			});
		}
	});
export type Usage = z.infer<typeof Usage>;

export const GateOutcome = z.object({
	name: z.string().min(1),
	passed: z.boolean(),
	attempt: z.number().int().positive().optional(),
});
export type GateOutcome = z.infer<typeof GateOutcome>;

export const CurrentOutcome = z.object({
	gates: z.array(GateOutcome),
	gatesPassed: z.boolean(),
	repairs: z.number().int().nonnegative(),
	escalations: z.number().int().nonnegative(),
	terminal: z.enum(["continue", "approve", "escalate", "stop"]),
});
export type CurrentOutcome = z.infer<typeof CurrentOutcome>;

export const RoutingObservation = ShadowDecision.extend({
	version: z.literal(1),
	runId: z.string().min(1),
	recordedAt: z.string().min(1),
	source: z.enum(["live", "representative-run"]),
	currentModelId: z.string().min(1).optional(),
	controller: z.object({
		kind: z.enum(["opus-readonly", "frontier-readonly"]),
		agent: z.literal("task-profile-controller"),
		model: z.string().min(1).optional(),
	}),
	context: z.object({
		size: TaskProfile.shape.contextSize,
		usage: Usage,
	}),
	currentOutcome: CurrentOutcome,
});
export type RoutingObservation = z.infer<typeof RoutingObservation>;

export function parseRoutingObservation(input: unknown): RoutingObservation {
	return RoutingObservation.parse(input);
}

export const UNAVAILABLE_USAGE: Usage = { source: "unavailable" };
