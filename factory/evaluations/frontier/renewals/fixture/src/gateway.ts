export type ChargeStatus = "succeeded" | "declined" | "requires_action";

export interface ChargeResult {
	id: string;
	status: ChargeStatus;
}

export interface Gateway {
	charge(input: {
		customer: string;
		amount: number;
		currency: string;
		idempotencyKey: string;
	}): Promise<ChargeResult>;
}
