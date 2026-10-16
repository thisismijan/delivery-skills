export {
	AUDIT_PREFIX,
	excludeHandledThreads,
	parseMrComments,
	type MrComment,
} from "./glab-comments";
import { excludeHandledThreads, parseMrComments } from "./glab-comments";

if (import.meta.main) {
	const input = await new Response(Bun.stdin.stream()).text();
	try {
		const authors = new Set(
			(process.env.DELIVERY_FACTORY_AUTHORS ?? "factory,delivery-bot")
				.split(",")
				.map((author) => author.trim())
				.filter(Boolean),
		);
		const comments = excludeHandledThreads(parseMrComments(input), authors);
		console.log(JSON.stringify(comments));
	} catch (error) {
		console.error(error instanceof Error ? error.message : String(error));
		process.exit(1);
	}
}
