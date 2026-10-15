// Maps a comment classification to its action group. Fail-closed: an
// unknown/invalid value throws (never silently defaults). Callers must
// validate input with the ClassificationVerdict Zod schema before calling.

export type Classification =
	| "bug"
	| "non-functional"
	| "nitpick"
	| "false-positive"
	| "question"
	| "outdated";

export type ActionGroup = "action" | "dispute" | "answer" | "skip";

const ROUTES: Record<Classification, ActionGroup> = {
	bug: "action",
	"non-functional": "action",
	nitpick: "dispute",
	"false-positive": "dispute",
	question: "answer",
	outdated: "skip",
};

export function classifyRoute(classification: string): ActionGroup {
	const route = (ROUTES as Record<string, ActionGroup | undefined>)[
		classification
	];
	if (route === undefined) {
		throw new Error(
			`unknown classification: ${JSON.stringify(classification)}`,
		);
	}
	return route;
}

if (import.meta.main) {
	const classification = process.argv[2] ?? "";
	try {
		console.log(
			JSON.stringify({ classification, action: classifyRoute(classification) }),
		);
	} catch (e) {
		console.error(e instanceof Error ? e.message : String(e));
		process.exit(1);
	}
}
