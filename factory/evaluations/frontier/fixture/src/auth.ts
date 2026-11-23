import type { IncomingMessage } from "node:http";

export interface User {
	id: string;
	plan: "free" | "pro";
}

// Anonymous requests are allowed on public routes and carry no user.
export async function authenticate(
	req: IncomingMessage,
): Promise<User | undefined> {
	const header = req.headers.authorization;
	if (!header?.startsWith("Bearer ")) return undefined;
	return lookupToken(header.slice("Bearer ".length));
}

async function lookupToken(token: string): Promise<User | undefined> {
	return token.length > 0 ? { id: token.slice(0, 8), plan: "free" } : undefined;
}
