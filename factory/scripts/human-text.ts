// Sanitize text bound for a human-facing surface (Jira comment, MR title/body, MR note).
// Em and en dashes read as machine-generated prose; replace them with a plain spaced
// hyphen so the factory writes the way a person would. Ordinary hyphens are left alone.
export function sanitizeHumanText(text: string): string {
	return text.replace(/\s*[—–]\s*/g, " - ").trim();
}

if (import.meta.main) {
	const input =
		process.argv[2] ?? (await new Response(Bun.stdin.stream()).text());
	console.log(sanitizeHumanText(input));
}
