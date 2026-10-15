import { readFile, stat } from "node:fs/promises";

const REQUIRED_SECTIONS = [
	"Context",
	"User stories",
	"What to build",
	"Acceptance criteria",
	"Out of scope",
	"Blocked by",
];

const SIZE_WARN_LINES = 400;
const SIZE_WARN_CHARS = 12000;

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

	// Count acceptance criteria checkboxes
	const checkboxPattern = /^- \[[ xX]\]/gm;
	const checkboxes = text.match(checkboxPattern) ?? [];
	if (checkboxes.length === 0) {
		missing.push(
			"Missing acceptance criteria: no checkboxes found (add at least one - [ ] or - [x] checkbox)",
		);
	}

	// Each acceptance-criterion checkbox must be a single-line, ordered,
	// case-insensitive Given/When/Then behaviour statement (tolerant of
	// leading/trailing clauses and an "And" continuation). Fail on the first
	// non-conforming criterion.
	const gwtOrderPattern = /\bgiven\b.*\bwhen\b.*\bthen\b/i;
	const checkboxLinePattern = /^- \[[ xX]\](.*)$/gm;
	for (const match of text.matchAll(checkboxLinePattern)) {
		const content = (match[1] ?? "").trim();
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

function escapeRegex(s: string): string {
	return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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
	const input = process.argv[2];
	if (!input) {
		console.error("usage: verify-ticket <draftPath|draftText>");
		process.exit(2);
	}
	const result = await verifyTicket(input);
	console.log(JSON.stringify(result));
	process.exit(result.ok ? 0 : 1);
}
