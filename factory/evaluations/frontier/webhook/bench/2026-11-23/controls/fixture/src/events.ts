export type Handler = (payload: Record<string, unknown>) => Promise<void>;

export const HANDLERS: Record<string, Handler> = {
	"charge.succeeded": async (payload) => {
		await recordCharge(payload);
	},
	"refund.created": async (payload) => {
		await recordRefund(payload);
	},
};

async function recordCharge(_payload: Record<string, unknown>): Promise<void> {}
async function recordRefund(_payload: Record<string, unknown>): Promise<void> {}
