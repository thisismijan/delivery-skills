import { readFile } from "node:fs/promises";

export const CHALLENGE_MARKER = "Challenged pick:";
export const CHALLENGE_LABELS = [
	"Challenge question:",
	"Evidence:",
	"Operator decision:",
	"Final pick:",
] as const;

// biome-ignore format: the workflow contract reads each invocation as one double-quoted literal
export const GROOM_DECISIONS_CHECK_INVOCATION =
	'bun "${FACTORY_ROOT}/scripts/groom-decisions.ts" check "<output-dir>/decisions.md" "<output-dir>/explorer-report.md"';

export type ChallengeCheck = {
	ok: boolean;
	problems: string[];
	entries: number;
};

const ENTRY_LABELS = [CHALLENGE_MARKER, ...CHALLENGE_LABELS];

const collapse = (text: string) => text.replace(/\s+/g, " ").trim();

function plainStart(line: string): string {
	let text = line.replace(/[*`]/g, "");
	let previous: string;
	do {
		previous = text;
		text = text.replace(/^\s+/, "").replace(/^(?:[-+>#]+|\d+[.)])/, "");
	} while (text !== previous);
	return text.toLowerCase();
}

const labelValue = (line: string, label: string) =>
	line.slice(label.length).trim();

export function checkChallenges(
	decisionsText: string,
	reportText: string,
): ChallengeCheck {
	const problems: string[] = [];
	const lines = decisionsText.split(/\r?\n/);
	const report = collapse(reportText);
	const marker = CHALLENGE_MARKER.toLowerCase().replace(/:$/, "");
	let entries = 0;
	let asked = new Set<string>();

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i] ?? "";
		if (line.startsWith("## ")) asked = new Set();
		if (!plainStart(line).startsWith(marker)) continue;
		const at = `Line ${i + 1}`;
		if (!line.startsWith(CHALLENGE_MARKER)) {
			problems.push(
				`${at}: "${line.trim()}" looks like a challenge entry but is not written exactly as "${CHALLENGE_MARKER} <pick>" with no decoration or leading characters.`,
			);
			continue;
		}

		const shapeProblems: string[] = [];
		ENTRY_LABELS.forEach((label, offset) => {
			const entryLine = lines[i + offset];
			if (entryLine === undefined || !entryLine.startsWith(label)) {
				shapeProblems.push(
					`${at}: the challenge entry that starts with "${CHALLENGE_MARKER}" must have "${label}" on line ${i + offset + 1}, directly after the previous line.`,
				);
			} else if (labelValue(entryLine, label) === "") {
				shapeProblems.push(`Line ${i + offset + 1}: "${label}" has no value.`);
			}
		});
		if (shapeProblems.length > 0) {
			problems.push(...shapeProblems);
			continue;
		}

		entries++;
		const [pick, question, evidence, decision, final] = ENTRY_LABELS.map(
			(label, offset) => labelValue(lines[i + offset] ?? "", label),
		) as [string, string, string, string, string];

		const first = evidence.indexOf('"');
		const last = evidence.lastIndexOf('"');
		const passage = first < last ? evidence.slice(first + 1, last).trim() : "";
		if (passage === "") {
			problems.push(
				`Line ${i + 3}: "Evidence:" must hold a non-empty passage between double quotes on that one line.`,
			);
		} else if (!report.includes(collapse(passage))) {
			problems.push(
				`The challenge "${question}" cites a passage that the explorer report does not contain.`,
			);
		}

		if (decision !== "kept" && decision !== "changed") {
			problems.push(
				`Line ${i + 4}: "Operator decision:" must be "kept" or "changed".`,
			);
		} else if (decision === "kept" && final !== pick) {
			problems.push(
				`The challenge "${question}" says the pick was kept, but "Final pick:" differs from "${CHALLENGE_MARKER}".`,
			);
		} else if (decision === "changed" && final === pick) {
			problems.push(
				`The challenge "${question}" says the pick was changed, but "Final pick:" is the same as "${CHALLENGE_MARKER}".`,
			);
		}

		if (asked.has(question)) {
			problems.push(
				`The challenge question "${question}" appears more than once under the same heading.`,
			);
		}
		asked.add(question);
		i += ENTRY_LABELS.length - 1;
	}

	return { ok: problems.length === 0, problems, entries };
}

async function readOrNull(path: string): Promise<string | null> {
	try {
		return await readFile(path, "utf8");
	} catch {
		return null;
	}
}

if (import.meta.main) {
	const [mode, decisionsPath, reportPath] = process.argv.slice(2);
	if (mode !== "check" || !decisionsPath || !reportPath) {
		console.error(
			"usage: groom-decisions check <decisions.md> <explorer-report.md>",
		);
		process.exit(2);
	}
	const decisions = await readOrNull(decisionsPath);
	const result: ChallengeCheck =
		decisions === null
			? {
					ok: false,
					problems: ["The decision log could not be read."],
					entries: 0,
				}
			: checkChallenges(decisions, (await readOrNull(reportPath)) ?? "");
	console.log(JSON.stringify(result));
	process.exit(result.ok ? 0 : 1);
}
