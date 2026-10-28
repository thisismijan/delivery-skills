import { readFile, stat, writeFile } from "node:fs/promises";

const REQUIRED_SECTIONS = [
	"Context",
	"User stories",
	"What to build",
	"Acceptance criteria",
	"Out of scope",
	"Blocked by",
];

export const SIZE_WARN_LINES = 400;
export const SIZE_WARN_CHARS = 12000;

function hasNewline(s: string): boolean {
	return s.includes("\n");
}

async function resolveInput(draftPathOrText: string): Promise<string> {
	if (!hasNewline(draftPathOrText)) {
		// Could be a file path — check if the file exists
		try {
			const s = await stat(draftPathOrText);
			if (s.isFile()) {
				return await readFile(draftPathOrText, "utf8");
			}
		} catch {
			// Not a file; treat as raw text
		}
	}
	return draftPathOrText;
}

export async function verifyTicket(
	draftPathOrText: string,
): Promise<{ ok: boolean; missing: string[]; warnings: string[] }> {
	const text = await resolveInput(draftPathOrText);
	const missing: string[] = [];
	const warnings: string[] = [];

	// Check required sections — each must appear as a markdown heading line
	for (const section of REQUIRED_SECTIONS) {
		const pattern = new RegExp(`^#{1,6}\\s+${escapeRegex(section)}\\s*$`, "im");
		if (!pattern.test(text)) {
			missing.push(`Missing required section: ${section}`);
		}
	}

	// Count checkboxes only inside the Acceptance criteria section. Examples
	// elsewhere and fenced code are not acceptance criteria.
	const checkboxes = acceptanceCriterionLines(text);
	if (checkboxes.length === 0) {
		missing.push(
			"Missing acceptance criteria: no checkboxes found (add at least one - [ ] or - [x] checkbox)",
		);
	} else if (checkboxes.length > 3) {
		missing.push(
			`Too many acceptance criteria: found ${checkboxes.length}, expected at most three (split independent behaviour clusters into atomic vertical tickets)`,
		);
	}

	// Each acceptance-criterion checkbox must be a single-line, ordered,
	// case-insensitive Given/When/Then behaviour statement (tolerant of
	// leading/trailing clauses and an "And" continuation). Fail on the first
	// non-conforming criterion.
	const gwtOrderPattern = /\bgiven\b.*\bwhen\b.*\bthen\b/i;
	for (const content of checkboxes) {
		if (!gwtOrderPattern.test(content)) {
			missing.push(
				`Acceptance criterion is not a Given/When/Then behaviour statement: "${content}" (each criterion must read as a single-line Given ... When ... Then ... statement)`,
			);
			break;
		}
	}

	// At most one user story per ticket — a slice must carry a single deliverable.
	const storyCount = countUserStories(text);
	if (storyCount > 1) {
		missing.push(
			`Too many user stories: found ${storyCount}, expected at most one (split into one slice per story)`,
		);
	}

	// Size heuristic — warn but do not fail
	const lineCount = text.split("\n").length;
	if (lineCount > SIZE_WARN_LINES || text.length > SIZE_WARN_CHARS) {
		warnings.push(
			`Draft is large (${lineCount} lines, ${text.length} chars); consider splitting into smaller slices`,
		);
	}

	return { ok: missing.length === 0, missing, warnings };
}

const HOUSEKEEPING_GAPS = [
	"Missing required section: Out of scope",
	"Missing required section: Blocked by",
] as const;

export function fillHousekeepingSections(
	text: string,
	missing: string[],
): string | null {
	if (missing.length === 0) return null;
	if (!missing.every((gap) => (HOUSEKEEPING_GAPS as readonly string[]).includes(gap))) {
		return null;
	}
	let filled = text.replace(/\s*$/, "\n");
	for (const gap of missing) {
		const name = gap.replace("Missing required section: ", "");
		filled += `\n## ${name}\nNone.\n`;
	}
	return filled;
}

function escapeRegex(s: string): string {
	return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function acceptanceCriterionLines(text: string): string[] {
	return [...sectionBody(text, "acceptance criteria").matchAll(/^- \[[ xX]\](.*)$/gm)].map(
		(match) => (match[1] ?? "").trim(),
	);
}

export function sectionBody(text: string, name: string): string {
	const lines = text.split("\n");
	const headingPattern = /^#{1,6}\s+(.+?)\s*$/;
	let inSection = false;
	let inFence = false;
	const body: string[] = [];
	for (const line of lines) {
		if (/^\s*```/.test(line)) {
			inFence = !inFence;
			continue;
		}
		if (inFence) continue;
		const heading = line.match(headingPattern);
		if (heading) {
			if (inSection) break;
			inSection = heading[1]?.trim().toLowerCase() === name.toLowerCase();
			continue;
		}
		if (inSection) body.push(line);
	}
	return body.join("\n");
}

export const QUESTION_SECTIONS = [
	"Context",
	"User stories",
	"What to build",
	"Acceptance criteria",
] as const;

export function hasOpenQuestion(text: string): boolean {
	const scoped = QUESTION_SECTIONS.map((name) => sectionBody(text, name)).join(
		"\n",
	);
	return scoped
		.replace(/`[^`]+`/g, "")
		.replace(/https?:\/\/[^\s)]+/gi, "")
		.includes("?");
}

// Count list items in the "User stories" section (between its heading and the
// next heading). A story is a markdown list item: "- ", "* ", "+ ", or "N." / "N)".
export function countUserStories(text: string): number {
	const lines = text.split("\n");
	const headingPattern = /^#{1,6}\s+/;
	const storyHeadingPattern = /^#{1,6}\s+user stories\s*$/i;
	const listItemPattern = /^\s*(?:[-*+]|\d+[.)])\s+\S/;

	let inSection = false;
	let count = 0;
	for (const line of lines) {
		if (storyHeadingPattern.test(line)) {
			inSection = true;
			continue;
		}
		if (inSection && headingPattern.test(line)) break; // next section
		if (inSection && listItemPattern.test(line)) count++;
	}
	return count;
}

if (import.meta.main) {
	const fillHousekeeping = process.argv[2] === "--fill-housekeeping";
	const input = fillHousekeeping ? process.argv[3] : process.argv[2];
	if (!input) {
		console.error(
			"usage: verify-ticket [--fill-housekeeping] <draftPath|draftText>",
		);
		process.exit(2);
	}
	const result = await verifyTicket(input);
	if (result.ok || !fillHousekeeping) {
		console.log(JSON.stringify(result));
		process.exit(result.ok ? 0 : 1);
	}
	if (hasNewline(input)) {
		console.log(JSON.stringify(result));
		process.exit(1);
	}
	try {
		const info = await stat(input);
		if (!info.isFile()) {
			console.log(JSON.stringify(result));
			process.exit(1);
		}
	} catch {
		console.log(JSON.stringify(result));
		process.exit(1);
	}
	const filled = fillHousekeepingSections(
		await resolveInput(input),
		result.missing,
	);
	if (filled === null) {
		console.log(JSON.stringify(result));
		process.exit(1);
	}
	const again = await verifyTicket(filled);
	if (!again.ok) {
		console.log(JSON.stringify(result));
		process.exit(1);
	}
	await writeFile(input, filled);
	console.log(JSON.stringify({ ...again, filled: true }));
	process.exit(0);
}
