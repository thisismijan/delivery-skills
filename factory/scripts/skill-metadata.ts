export const PORTABLE_FRONTMATTER_KEYS = [
	"name",
	"description",
	"license",
	"compatibility",
	"metadata",
] as const;

export const HOST_FRONTMATTER_KEYS = [
	"disable-model-invocation",
	"argument-hint",
	"tools",
	"allowed-tools",
	"effort",
	"model",
] as const;

export const NOT_FOR_STAGE_SKILLS = [
	"groom",
	"draft",
	"execute",
	"address-comments",
] as const;

const PORTABLE = new Set<string>(PORTABLE_FRONTMATTER_KEYS);
const HOST = new Set<string>(HOST_FRONTMATTER_KEYS);
const NOT_FOR_COVERED = new Set<string>(NOT_FOR_STAGE_SKILLS);

function frontmatterBlock(text: string): string | null {
	if (!text.startsWith("---\n")) return null;
	const end = text.indexOf("\n---\n", 4);
	return end < 0 ? null : text.slice(4, end);
}

function isIndented(line: string): boolean {
	return line.startsWith(" ") || line.startsWith("\t");
}

function readFrontmatterValue(text: string, key: string): string | null {
	const block = frontmatterBlock(text);
	if (block === null) return null;
	const lines = block.split(/\r?\n/);
	const start = lines.findIndex((line) => line.startsWith(`${key}:`));
	if (start < 0) return null;
	const parts: string[] = [];
	const first = (lines[start] ?? "").slice(key.length + 1).trim();
	if (first.length > 0 && !/^[>|]-?$/.test(first)) parts.push(first);
	for (const line of lines.slice(start + 1)) {
		if (line.length > 0 && !isIndented(line)) break;
		if (line.trim().length > 0) parts.push(line.trim());
	}
	const value = parts.join(" ").trim();
	const quote = value[0];
	if (
		value.length >= 2 &&
		(quote === '"' || quote === "'") &&
		value.endsWith(quote)
	) {
		return value.slice(1, -1);
	}
	return value;
}

export function parseSkillName(text: string): string | null {
	return readFrontmatterValue(text, "name");
}

export function parseSkillDescription(text: string): string | null {
	return readFrontmatterValue(text, "description");
}

export function hasNotForClause(description: string): boolean {
	return /(?:^|[.?!]\s+)Not for\s+\S/.test(description);
}

export function coveredSkillIssues(skillNames: string[]): string[] {
	return NOT_FOR_STAGE_SKILLS.filter((name) => !skillNames.includes(name)).map(
		(name) =>
			`stage skill '${name}' in NOT_FOR_STAGE_SKILLS matches no skill in the pack`,
	);
}

export function parseSkillFrontmatter(text: string): {
	keys: string[];
	body: string;
} {
	if (!text.startsWith("---\n")) {
		return { keys: [], body: text };
	}
	const end = text.indexOf("\n---\n", 4);
	if (end < 0) {
		return { keys: [], body: text };
	}
	const raw = text.slice(4, end);
	const body = text.slice(end + 5);
	const keys: string[] = [];
	for (const line of raw.split(/\r?\n/)) {
		if (line.length === 0 || line.startsWith(" ") || line.startsWith("\t")) {
			continue;
		}
		const colon = line.indexOf(":");
		if (colon <= 0) continue;
		keys.push(line.slice(0, colon));
	}
	return { keys, body };
}

export function skillMetadataIssues(
	text: string,
	relativePath: string,
): string[] {
	const issues: string[] = [];
	const { keys, body } = parseSkillFrontmatter(text);
	if (keys.length === 0) {
		issues.push(`${relativePath}: missing portable YAML frontmatter`);
		return issues;
	}
	if (!keys.includes("name") || !keys.includes("description")) {
		issues.push(
			`${relativePath}: frontmatter must include name and description`,
		);
	}
	for (const key of keys) {
		if (HOST.has(key)) {
			issues.push(
				`${relativePath}: host field '${key}' belongs in an adapter overlay`,
			);
		} else if (!PORTABLE.has(key)) {
			issues.push(`${relativePath}: non-portable frontmatter field '${key}'`);
		}
	}
	if (body.includes("$ARGUMENTS")) {
		issues.push(
			`${relativePath}: replace $ARGUMENTS with host-neutral skill arguments language`,
		);
	}
	const name = parseSkillName(text);
	if (
		name !== null &&
		NOT_FOR_COVERED.has(name) &&
		!hasNotForClause(parseSkillDescription(text) ?? "")
	) {
		issues.push(
			`${relativePath}: stage skill '${name}' description has no not-for clause`,
		);
	}
	return issues;
}
