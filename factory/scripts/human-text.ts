const LONG_DASH = /\s*[\u2013\u2014]\s*/g;

// En and em dashes make a comment or merge request read as generated prose, so
// each becomes a spaced hyphen. A plain hyphen is never touched.
export function sanitizeHumanText(input: string): string {
	const spaced = input.replaceAll(LONG_DASH, " - ");
	return spaced.trim();
}

if (import.meta.main) {
	const [argument] = process.argv.slice(2);
	const raw = argument ?? (await Bun.stdin.text());
	console.log(sanitizeHumanText(raw));
}
