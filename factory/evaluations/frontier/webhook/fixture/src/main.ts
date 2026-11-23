import { createServer } from "node:http";
import { enqueue } from "./queue";
import { verifySignature } from "./signature";

// One instance runs in production; the processed-event table is the durable record.
createServer(async (req, res) => {
	const body = await readBody(req);
	if (!verifySignature(body, req.headers["x-signature"])) {
		res.statusCode = 401;
		res.end();
		return;
	}
	const eventId = String(req.headers["x-event-id"] ?? "");
	enqueue({ eventId, body });
	res.statusCode = 202;
	res.end();
}).listen(Number(process.env.PORT ?? 8080));

async function readBody(req: AsyncIterable<Buffer>): Promise<string> {
	const chunks: Buffer[] = [];
	for await (const chunk of req) chunks.push(chunk);
	return Buffer.concat(chunks).toString("utf8");
}
