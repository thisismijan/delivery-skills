import type { IncomingMessage, ServerResponse } from "node:http";
import type { User } from "./auth";
import { feeFor } from "./fees";

export async function handle(
	req: IncomingMessage,
	res: ServerResponse,
	user: User | undefined,
): Promise<void> {
	if (req.url?.startsWith("/public/quote")) {
		res.end(JSON.stringify({ fee: feeFor(1000, "GBP") }));
		return;
	}
	if (!user) {
		res.statusCode = 401;
		res.end();
		return;
	}
	res.end(JSON.stringify({ user: user.id }));
}
