export class EscalateError extends Error {
	readonly reason: string;
	constructor(reason: string) {
		super(reason);
		this.name = "EscalateError";
		this.reason = reason;
	}
}

// Fail-closed guard: throw EscalateError unless the condition holds.
export function assertOrEscalate(
	condition: unknown,
	reason: string,
): asserts condition {
	if (!condition) {
		throw new EscalateError(reason);
	}
}
