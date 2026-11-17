export class EscalateError extends Error {
	override name = "EscalateError";

	constructor(readonly reason: string) {
		super(reason);
	}
}

// Fails closed: anything short of a truthy condition hands the run to a human.
export function assertOrEscalate(
	condition: unknown,
	reason: string,
): asserts condition {
	if (condition) return;
	throw new EscalateError(reason);
}
