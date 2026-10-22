export {
	AUDIT_PREFIX,
	excludeHandledThreads,
	type MrComment,
} from "./glab-comments";
import { ForgeDiscussions } from "./forge-provider";
import { type MrComment, excludeHandledThreads } from "./glab-comments";

export function parseForgeDiscussions(input: unknown): MrComment[] {
	const result = ForgeDiscussions.parse(input);
	return result.discussions.flatMap((discussion) =>
		discussion.notes
			.filter((note) => !note.system)
			.map((note) => ({
				id: note.id,
				discussionId: discussion.id,
				author: note.author,
				body: note.body,
			})),
	);
}

if (import.meta.main) {
	const input = await new Response(Bun.stdin.stream()).text();
	try {
		const authors = new Set(
			(process.env.DELIVERY_FACTORY_AUTHORS ?? "factory,delivery-bot")
				.split(",")
				.map((author) => author.trim())
				.filter(Boolean),
		);
		const comments = excludeHandledThreads(
			parseForgeDiscussions(JSON.parse(input) as unknown),
			authors,
		);
		console.log(JSON.stringify(comments));
	} catch (error) {
		console.error(error instanceof Error ? error.message : String(error));
		process.exit(1);
	}
}
