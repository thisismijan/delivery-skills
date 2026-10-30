import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { z } from "zod";
import { AssumptionLabel, parseClassificationVerdict } from "./verdicts";

// biome-ignore format: the workflow contract reads each invocation as one double-quoted literal
export const REVIEW_ROUNDS_RECORD_INVOCATION =
	"scripts/review-rounds.ts record <review-rounds.json> <classification.json> <head-sha>";
// biome-ignore format: the workflow contract reads each invocation as one double-quoted literal
export const REVIEW_ROUNDS_PREMISE_INVOCATION =
	"scripts/review-rounds.ts premise <review-rounds.json> <assumption> <outcome.md>";

const Sha = z.string().regex(/^[0-9a-f]{40}$/, "must be a full commit SHA");

const Round = z
	.object({
		round: z.number().int().positive(),
		head: Sha,
		bugs: z.array(
			z
				.object({ commentId: z.string().min(1), assumption: AssumptionLabel })
				.strict(),
		),
	})
	.strict();

const PremiseCheck = z
	.object({
		assumption: AssumptionLabel,
		afterRound: z.number().int().positive(),
		outcome: z.string().trim().min(1),
	})
	.strict();

export const ReviewRounds = z
	.object({
		version: z.literal(1),
		rounds: z.array(Round),
		premiseChecks: z.array(PremiseCheck),
	})
	.strict()
	.superRefine((value, ctx) => {
		value.rounds.forEach((round, index) => {
			if (round.round !== index + 1) {
				ctx.addIssue({
					code: "custom",
					path: ["rounds", index, "round"],
					message: "rounds are numbered from 1 without gaps",
				});
			}
		});
	});
export type ReviewRounds = z.infer<typeof ReviewRounds>;

export type RoundDecision =
	| { decision: "continue"; round: number }
	| { decision: "premise-check"; round: number; repeated: string[] }
	| { decision: "stop"; round: number; repeated: string[]; reason: string };

export function emptyRounds(): ReviewRounds {
	return { version: 1, rounds: [], premiseChecks: [] };
}

export function loadRounds(path: string): ReviewRounds {
	if (!existsSync(path)) return emptyRounds();
	let raw: unknown;
	try {
		raw = JSON.parse(readFileSync(path, "utf8"));
	} catch {
		throw new Error(`${path} is not valid JSON.`);
	}
	return ReviewRounds.parse(raw);
}

export function decideRound(rounds: ReviewRounds): RoundDecision {
	const current = rounds.rounds.at(-1);
	if (!current) throw new Error("no review round has been recorded");
	const earlier = new Set(
		rounds.rounds
			.slice(0, -1)
			.flatMap((round) => round.bugs.map((bug) => bug.assumption)),
	);
	const repeated = [
		...new Set(
			current.bugs
				.map((bug) => bug.assumption)
				.filter((label) => earlier.has(label)),
		),
	].sort();
	if (repeated.length === 0) {
		return { decision: "continue", round: current.round };
	}
	const checked = repeated.filter((label) =>
		rounds.premiseChecks.some((check) => check.assumption === label),
	);
	if (checked.length > 0) {
		return {
			decision: "stop",
			round: current.round,
			repeated,
			reason: `The approach was already re-examined for ${checked.join(", ")} and review found the same kind of problem again. Stop and ask the operator how to proceed.`,
		};
	}
	return { decision: "premise-check", round: current.round, repeated };
}

// Recording the same head again replaces that round, so a re-entered
// address-comments run does not count as a new round.
export function recordRound(
	rounds: ReviewRounds,
	classification: unknown,
	head: string,
): ReviewRounds {
	const verdict = parseClassificationVerdict(JSON.stringify(classification));
	const bugs = verdict.flatMap((comment) =>
		comment.classification === "bug" && comment.assumption
			? [{ commentId: comment.commentId, assumption: comment.assumption }]
			: [],
	);
	const previous = rounds.rounds.at(-1);
	const kept =
		previous && previous.head === Sha.parse(head)
			? rounds.rounds.slice(0, -1)
			: rounds.rounds;
	return ReviewRounds.parse({
		...rounds,
		rounds: [...kept, { round: kept.length + 1, head, bugs }],
	});
}

export function recordPremiseCheck(
	rounds: ReviewRounds,
	assumption: string,
	outcome: string,
): ReviewRounds {
	const decision = decideRound(rounds);
	if (decision.decision !== "premise-check") {
		throw new Error("the latest round does not need a premise check");
	}
	const label = AssumptionLabel.parse(assumption);
	if (!decision.repeated.includes(label)) {
		throw new Error(`${label} did not repeat in round ${decision.round}`);
	}
	return ReviewRounds.parse({
		...rounds,
		premiseChecks: [
			...rounds.premiseChecks,
			{ assumption: label, afterRound: decision.round, outcome },
		],
	});
}

function save(path: string, rounds: ReviewRounds): void {
	writeFileSync(path, `${JSON.stringify(rounds, null, "\t")}\n`);
}

if (import.meta.main) {
	const [command, path, ...args] = process.argv.slice(2);
	try {
		if (command === "record" && path && args[0] && args[1]) {
			const next = recordRound(
				loadRounds(path),
				JSON.parse(readFileSync(args[0], "utf8")),
				args[1],
			);
			save(path, next);
			const decision = decideRound(next);
			console.log(JSON.stringify(decision, null, 2));
			process.exit(
				decision.decision === "continue"
					? 0
					: decision.decision === "premise-check"
						? 3
						: 1,
			);
		} else if (command === "premise" && path && args[0] && args[1]) {
			const next = recordPremiseCheck(
				loadRounds(path),
				args[0],
				readFileSync(args[1], "utf8"),
			);
			save(path, next);
			console.log(
				JSON.stringify({ recorded: args[0], afterRound: next.rounds.length }),
			);
		} else {
			console.error(
				`usage: ${REVIEW_ROUNDS_RECORD_INVOCATION} | ${REVIEW_ROUNDS_PREMISE_INVOCATION}`,
			);
			process.exit(2);
		}
	} catch (error) {
		console.error(error instanceof Error ? error.message : String(error));
		process.exit(1);
	}
}
