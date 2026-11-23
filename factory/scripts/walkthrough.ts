import { existsSync, readFileSync, readdirSync } from "node:fs";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { z } from "zod";
import { gitDiff, scanDiff } from "./diff-scan";

// An opt-in check that the operator understands a change before merging it. The conductor asks
// a few questions grounded in these topics; this script only finds the topics, validates what
// was recorded, and summarises it. It never decides anything about the change.

export const WALKTHROUGH_USAGE = [
	"usage: walkthrough.ts topics <repoRoot> <changeDir> <base> <head>",
	"       walkthrough.ts record <repoRoot> <record.json>",
	"       walkthrough.ts summary <repoRoot> <ref> <head>",
].join("\n");
export const MAX_TOPICS = 12;
export const MAX_QUESTIONS = 5;
export const MAX_HINTS = 2;

export const TOPIC_KINDS = [
	"one-way",
	"surface",
	"criterion",
	"alternative",
	"change",
] as const;

export interface WalkthroughTopic {
	kind: (typeof TOPIC_KINDS)[number];
	text: string;
	source: string;
}

function specFiles(dir: string): string[] {
	if (!existsSync(dir)) return [];
	return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
		const path = join(dir, entry.name);
		if (entry.isDirectory()) return specFiles(path);
		return entry.name === "spec.md" ? [path] : [];
	});
}

// Each acceptance scenario, named with the requirement it belongs to.
export function criterionTopics(
	repoRoot: string,
	changeDir: string,
): WalkthroughTopic[] {
	const topics: WalkthroughTopic[] = [];
	for (const file of specFiles(join(changeDir, "specs")).sort()) {
		let requirement = "";
		for (const line of readFileSync(file, "utf8").split("\n")) {
			const heading = line.match(/^### Requirement:\s*(.+)$/);
			if (heading) requirement = heading[1]?.trim() ?? "";
			const scenario = line.match(/^#### Scenario:\s*(.+)$/);
			if (scenario?.[1]) {
				topics.push({
					kind: "criterion",
					text: requirement
						? `${requirement}: ${scenario[1].trim()}`
						: scenario[1].trim(),
					source: relative(repoRoot, file),
				});
			}
		}
	}
	return topics;
}

// The options the design turned down, from a section whose heading names alternatives.
export function alternativeTopics(
	repoRoot: string,
	changeDir: string,
): WalkthroughTopic[] {
	const file = join(changeDir, "design.md");
	if (!existsSync(file)) return [];
	const topics: WalkthroughTopic[] = [];
	let inSection = false;
	for (const line of readFileSync(file, "utf8").split("\n")) {
		const heading = line.match(/^#{2,4}\s+(.+)$/);
		if (heading) {
			inSection = /alternative|rejected|considered/i.test(heading[1] ?? "");
			continue;
		}
		const bullet = line.match(/^\s*[-*]\s+(.+)$/);
		if (inSection && bullet?.[1]) {
			topics.push({
				kind: "alternative",
				text: bullet[1].trim(),
				source: relative(repoRoot, file),
			});
		}
	}
	return topics;
}

const TEST_PATH =
	/(^|\/)(tests?|__tests__|spec)\/|[._-](test|spec)\.[^/]+$|_test\.go$/;

// Risky parts of the diff first, then the source files that changed most.
export function diffTopics(diff: string): WalkthroughTopic[] {
	const scan = scanDiff(diff);
	const topics: WalkthroughTopic[] = [
		...scan.oneWay.map((signal) => ({
			kind: "one-way" as const,
			text: `A change that is hard to undo: ${signal.line.trim()}`,
			source: signal.path,
		})),
		...scan.marks.map((mark) => ({
			kind: "surface" as const,
			text: `${mark.surface} change: ${mark.signal}`,
			source: mark.path,
		})),
	];
	const sizes = new Map<string, number>();
	let current: string | undefined;
	for (const line of diff.split("\n")) {
		const header = line.match(/^\+\+\+ b\/(.+)$/);
		if (header?.[1]) {
			current = header[1];
			continue;
		}
		if (
			current &&
			!scan.excluded.includes(current) &&
			!TEST_PATH.test(current) &&
			/^[+-](?![+-]{2} )/.test(line)
		) {
			sizes.set(current, (sizes.get(current) ?? 0) + 1);
		}
	}
	const largest = [...sizes.entries()]
		.sort(
			(left, right) => right[1] - left[1] || left[0].localeCompare(right[0]),
		)
		.slice(0, 3);
	for (const [path, lines] of largest) {
		topics.push({
			kind: "change",
			text: `${lines} changed lines`,
			source: path,
		});
	}
	return topics;
}

export function rankTopics(
	topics: readonly WalkthroughTopic[],
): WalkthroughTopic[] {
	const seen = new Set<string>();
	return [...topics]
		.sort(
			(left, right) =>
				TOPIC_KINDS.indexOf(left.kind) - TOPIC_KINDS.indexOf(right.kind),
		)
		.filter((topic) => {
			const key = `${topic.kind}\u0000${topic.source}\u0000${topic.text}`;
			if (seen.has(key)) return false;
			seen.add(key);
			return true;
		})
		.slice(0, MAX_TOPICS);
}

const Revision = z.string().regex(/^[0-9a-f]{7,64}$/);

export const WalkthroughRecord = z
	.object({
		version: z.literal(1),
		ref: z.string().trim().min(1).max(200),
		headRevision: Revision,
		questions: z
			.array(
				z
					.object({
						topic: z.string().trim().min(1),
						source: z.string().trim().min(1),
						kind: z.enum(["predict", "why", "flaw", "apply", "connect"]),
						outcome: z.enum([
							"explained",
							"explained-after-hints",
							"not-explained",
							"stopped",
						]),
						hints: z.number().int().min(0).max(MAX_HINTS),
					})
					.strict()
					.superRefine((question, ctx) => {
						const ok =
							question.outcome === "explained"
								? question.hints === 0
								: question.outcome === "explained-after-hints"
									? question.hints > 0
									: true;
						if (!ok) {
							ctx.addIssue({
								code: "custom",
								path: ["hints"],
								message:
									"explained means no hints were needed; explained-after-hints needs at least one",
							});
						}
					}),
			)
			.min(1)
			.max(MAX_QUESTIONS),
	})
	.strict();
export type WalkthroughRecord = z.infer<typeof WalkthroughRecord>;

export function recordPath(
	repoRoot: string,
	ref: string,
	head: string,
): string {
	return join(repoRoot, ".review", `mr-${ref}`, head, "walkthrough.json");
}

export async function writeRecord(
	repoRoot: string,
	raw: unknown,
): Promise<string> {
	const record = WalkthroughRecord.parse(raw);
	const path = recordPath(repoRoot, record.ref, record.headRevision);
	await mkdir(dirname(path), { recursive: true });
	const temporary = `${path}.${process.pid}.tmp`;
	await writeFile(temporary, `${JSON.stringify(record, null, 2)}\n`);
	await rename(temporary, path);
	return path;
}

// Plain lines for the release-readiness brief. Informational only: it never changes a verdict.
export function summarize(
	record: WalkthroughRecord | null,
	ref: string,
	head: string,
): string {
	if (!record) {
		return `No walkthrough at this head. To check your understanding before merging, run \`/delivery walkthrough ${ref}\`.`;
	}
	const explained = record.questions.filter(
		(question) => question.outcome === "explained",
	).length;
	const withHints = record.questions.filter(
		(question) => question.outcome === "explained-after-hints",
	);
	const open = record.questions.filter(
		(question) =>
			question.outcome === "not-explained" || question.outcome === "stopped",
	);
	const lines = [
		`Walkthrough at ${head.slice(0, 9)}: you explained ${explained} of ${record.questions.length} without hints.`,
		...withHints.map(
			(question) =>
				`- Explained after ${question.hints === 1 ? "a hint" : `${question.hints} hints`}: ${question.topic} (\`${question.source}\`)`,
		),
		...open.map(
			(question) =>
				`- Worth reading before merging: ${question.topic} (\`${question.source}\`)`,
		),
	];
	return lines.join("\n");
}

if (import.meta.main) {
	const [command, ...args] = process.argv.slice(2);
	try {
		if (command === "topics" && args.length === 4) {
			const [repoRoot, changeDir, base, head] = args as [
				string,
				string,
				string,
				string,
			];
			const topics = rankTopics([
				...diffTopics(await gitDiff(base, head, repoRoot)),
				...criterionTopics(repoRoot, changeDir),
				...alternativeTopics(repoRoot, changeDir),
			]);
			console.log(JSON.stringify({ topics }, null, 2));
		} else if (command === "record" && args.length === 2) {
			const [repoRoot, file] = args as [string, string];
			console.log(
				await writeRecord(repoRoot, JSON.parse(await readFile(file, "utf8"))),
			);
		} else if (command === "summary" && args.length === 3) {
			const [repoRoot, ref, head] = args as [string, string, string];
			const path = recordPath(repoRoot, ref, head);
			const record = existsSync(path)
				? WalkthroughRecord.parse(JSON.parse(await readFile(path, "utf8")))
				: null;
			console.log(summarize(record, ref, head));
		} else {
			console.error(WALKTHROUGH_USAGE);
			process.exit(2);
		}
	} catch (error) {
		console.error(error instanceof Error ? error.message : String(error));
		process.exit(1);
	}
}
