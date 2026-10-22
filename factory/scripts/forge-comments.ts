export {
	AUDIT_PREFIX,
	excludeHandledThreads,
	parseAuthorList,
	reviewBotThreads,
	scopeAuthors,
	type MrComment,
	type ReviewBotStatus,
} from "./glab-comments";
import { ForgeDiscussions } from "./forge-provider";
import {
	type MrComment,
	excludeHandledThreads,
	reviewBotThreads,
	scopeAuthors,
} from "./glab-comments";

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

// Default: in-scope comments for address-comments. `review-bots`: the change's
// review-bot status (configured, botHasCommented, unanswered threads), read
// before a change is reported ready to merge or queue.
if (import.meta.main) {
	const input = await new Response(Bun.stdin.stream()).text();
	try {
		const mode = process.argv[2];
		if (mode !== undefined && mode !== "review-bots") {
			throw new Error(`unknown forge-comments mode: ${mode}`);
		}
		const authors = scopeAuthors();
		const parsed = parseForgeDiscussions(JSON.parse(input) as unknown);
		const output =
			mode === "review-bots"
				? reviewBotThreads(parsed, authors.reviewBots)
				: excludeHandledThreads(parsed, authors.factory);
		console.log(JSON.stringify(output));
	} catch (error) {
		console.error(error instanceof Error ? error.message : String(error));
		process.exit(1);
	}
}
