// A change description says what the agent decided on the reader's behalf and
// what its green checks leave unproven, because a summary that only says the
// work went well hides both.
export const DECISIONS_SECTION = "Decisions made for you";
export const UNPROVEN_SECTION = "What the checks do not prove";
export const CHANGE_DESCRIPTION_SECTIONS = [
	DECISIONS_SECTION,
	UNPROVEN_SECTION,
] as const;

export const CHANGE_DESCRIPTION_INVOCATION =
	"scripts/change-description.ts check <create-input.json>";

export interface DescriptionCheck {
	ok: boolean;
	problems: string[];
}

const HEADING = /^#{2,4}\s+(.+?)\s*#*\s*$/;
const EMPTY = /^(?:[-*]\s*)?(?:none|n\/a|nothing|-+)\.?$/i;

function sections(text: string): Map<string, string[][]> {
	const found = new Map<string, string[][]>();
	let current: string[] | undefined;
	for (const line of text.split(/\r?\n/)) {
		const heading = line.match(HEADING);
		if (heading) {
			const title = (heading[1] as string).trim();
			current = [];
			found.set(title, [...(found.get(title) ?? []), current]);
			continue;
		}
		current?.push(line);
	}
	return found;
}

export function checkDescription(text: string): DescriptionCheck {
	const problems: string[] = [];
	const found = sections(text);
	for (const title of CHANGE_DESCRIPTION_SECTIONS) {
		const bodies = found.get(title) ?? [];
		if (bodies.length === 0) {
			problems.push(`The description has no "${title}" section.`);
			continue;
		}
		if (bodies.length > 1) {
			problems.push(`The description has more than one "${title}" section.`);
			continue;
		}
		const body = (bodies[0] as string[])
			.map((line) => line.trim())
			.filter((line) => line.length > 0);
		if (body.length === 0) {
			problems.push(`The "${title}" section is empty.`);
			continue;
		}
		if (title === UNPROVEN_SECTION && body.every((line) => EMPTY.test(line))) {
			problems.push(
				`The "${title}" section says none. Every check leaves something unproven: name what the tests fake, what no test exercises, or what was tested only against the data it was written from.`,
			);
		}
	}
	return { ok: problems.length === 0, problems };
}

if (import.meta.main) {
	const [command, path] = process.argv.slice(2);
	if (command !== "check" || !path) {
		console.error(`usage: ${CHANGE_DESCRIPTION_INVOCATION}`);
		process.exit(2);
	}
	try {
		const raw = await Bun.file(path).text();
		const description = path.endsWith(".json")
			? (JSON.parse(raw) as { description?: unknown }).description
			: raw;
		if (typeof description !== "string") {
			throw new Error("The input has no description text.");
		}
		const result = checkDescription(description);
		console.log(JSON.stringify(result, null, 2));
		process.exit(result.ok ? 0 : 1);
	} catch (error) {
		console.error(error instanceof Error ? error.message : String(error));
		process.exit(1);
	}
}
