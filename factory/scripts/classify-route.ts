// Validate the batch with ClassificationVerdict first. This lookup has no
// fallback group: a class it does not know is an error, never a guess.

export type Classification =
	| "bug"
	| "test-gap"
	| "non-functional"
	| "nitpick"
	| "false-positive"
	| "question"
	| "outdated";

const GROUP_BY_CLASS = {
	bug: "action",
	"test-gap": "action",
	"non-functional": "action",
	nitpick: "dispute",
	"false-positive": "dispute",
	question: "answer",
	outdated: "skip",
} as const satisfies Record<Classification, string>;

export type ActionGroup = (typeof GROUP_BY_CLASS)[Classification];

const GROUP_OF = new Map<string, ActionGroup>(Object.entries(GROUP_BY_CLASS));

export function classifyRoute(value: string): ActionGroup {
	const group = GROUP_OF.get(value);
	if (group === undefined) {
		const quoted = JSON.stringify(value);
		throw new Error(`unknown classification: ${quoted}`);
	}
	return group;
}

if (import.meta.main) {
	const [classification = ""] = process.argv.slice(2);
	try {
		const action = classifyRoute(classification);
		console.log(JSON.stringify({ classification, action }));
	} catch (error) {
		console.error(error instanceof Error ? error.message : String(error));
		process.exit(1);
	}
}
