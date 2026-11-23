import cluster from "node:cluster";
import { createServer } from "node:http";
import { authenticate } from "./auth";
import { handle } from "./routes";

const workers = Number(process.env.WORKERS ?? 4);

if (cluster.isPrimary) {
	for (let index = 0; index < workers; index += 1) cluster.fork();
	cluster.on("exit", () => cluster.fork());
} else {
	createServer(async (req, res) => {
		const user = await authenticate(req);
		await handle(req, res, user);
	}).listen(Number(process.env.PORT ?? 8080));
}
