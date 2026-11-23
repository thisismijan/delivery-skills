import { createHmac, timingSafeEqual } from "node:crypto";

const SECRET = process.env.WEBHOOK_SECRET ?? "";

// The provider signs the raw request body only. Headers are not covered.
export function verifySignature(body: string, header: unknown): boolean {
	if (typeof header !== "string") return false;
	const expected = createHmac("sha256", SECRET).update(body).digest("hex");
	const given = Buffer.from(header, "hex");
	const wanted = Buffer.from(expected, "hex");
	return given.length === wanted.length && timingSafeEqual(given, wanted);
}
