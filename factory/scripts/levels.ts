import { z } from "zod";

export const DELIVERY_LEVELS = ["min", "standard", "max"] as const;
export type DeliveryLevel = (typeof DELIVERY_LEVELS)[number];
export const DEFAULT_DELIVERY_LEVEL: DeliveryLevel = "standard";

export const DeliveryLevel = z.enum(DELIVERY_LEVELS);

export type ReviewBreadth = "size-trimmed" | "measured" | "every-lens";
export type ImplementerTier = "measured" | "frontier";

export interface LevelSettings {
	maxParallelWorktrees: number;
	maxFixAttempts: number;
	maxReviewRounds: number;
	reviewBreadth: ReviewBreadth;
	implementerTier: ImplementerTier;
	summary: string;
}

// `standard` must stay identical to the pre-level defaults, so a run started
// without a level behaves exactly as before.
export const LEVEL_SETTINGS: Readonly<Record<DeliveryLevel, LevelSettings>> = {
	min: {
		maxParallelWorktrees: 2,
		maxFixAttempts: 1,
		maxReviewRounds: 2,
		reviewBreadth: "size-trimmed",
		implementerTier: "measured",
		summary:
			"Lowest cost: fewer workers at once, fewer repair and review rounds, and size alone never adds review lenses.",
	},
	standard: {
		maxParallelWorktrees: 4,
		maxFixAttempts: 2,
		maxReviewRounds: 3,
		reviewBreadth: "measured",
		implementerTier: "measured",
		summary: "The default balance of cost, speed, and depth.",
	},
	max: {
		maxParallelWorktrees: 8,
		maxFixAttempts: 3,
		maxReviewRounds: 4,
		reviewBreadth: "every-lens",
		implementerTier: "frontier",
		summary:
			"Fastest and deepest: more workers at once, every review lens on every change, and a frontier implementer.",
	},
};

export function parseLevel(value: string | undefined): DeliveryLevel {
	if (value === undefined || value === "") return DEFAULT_DELIVERY_LEVEL;
	const parsed = DeliveryLevel.safeParse(value);
	if (!parsed.success) {
		throw new Error(
			`unknown delivery level '${value}'; use ${DELIVERY_LEVELS.join(", ")}`,
		);
	}
	return parsed.data;
}

function isLevel(word: string | undefined): word is DeliveryLevel {
	return (DELIVERY_LEVELS as readonly string[]).includes(word ?? "");
}

export interface SplitLevel {
	level?: DeliveryLevel;
	args: string;
}

// A level is the first word, or the word right after the verb. Any other
// position is left alone so prose that happens to contain "max" is untouched.
export function splitLevel(
	args: string,
	verbs: ReadonlySet<string>,
): SplitLevel {
	const words = args
		.trim()
		.split(/\s+/)
		.filter((word) => word.length > 0);
	const first = words[0];
	if (isLevel(first)) {
		if (
			isLevel(words[1]) ||
			(words[1] && verbs.has(words[1]) && isLevel(words[2]))
		) {
			throw new Error("Name one delivery level, not two.");
		}
		return { level: first, args: words.slice(1).join(" ") };
	}
	if (first && verbs.has(first) && isLevel(words[1])) {
		if (isLevel(words[2])) throw new Error("Name one delivery level, not two.");
		return {
			level: words[1],
			args: [first, ...words.slice(2)].join(" "),
		};
	}
	return { args: args.trim() };
}

if (import.meta.main) {
	const level = process.argv[2];
	try {
		const levels = level ? [parseLevel(level)] : [...DELIVERY_LEVELS];
		console.log(
			JSON.stringify(
				Object.fromEntries(levels.map((name) => [name, LEVEL_SETTINGS[name]])),
				null,
				2,
			),
		);
	} catch (error) {
		console.error(error instanceof Error ? error.message : String(error));
		process.exit(1);
	}
}
