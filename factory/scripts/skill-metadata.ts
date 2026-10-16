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

const PORTABLE = new Set<string>(PORTABLE_FRONTMATTER_KEYS);
const HOST = new Set<string>(HOST_FRONTMATTER_KEYS);

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

export function skillMetadataIssues(text: string, relativePath: string): string[] {
	const issues: string[] = [];
	const { keys, body } = parseSkillFrontmatter(text);
	if (keys.length === 0) {
		issues.push(`${relativePath}: missing portable YAML frontmatter`);
		return issues;
	}
	if (!keys.includes("name") || !keys.includes("description")) {
		issues.push(`${relativePath}: frontmatter must include name and description`);
	}
	for (const key of keys) {
		if (HOST.has(key)) {
			issues.push(`${relativePath}: host field '${key}' belongs in an adapter overlay`);
		} else if (!PORTABLE.has(key)) {
			issues.push(`${relativePath}: non-portable frontmatter field '${key}'`);
		}
	}
	if (body.includes("$ARGUMENTS")) {
		issues.push(
			`${relativePath}: replace $ARGUMENTS with host-neutral skill arguments language`,
		);
	}
	return issues;
}
