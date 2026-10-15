export function changeName(jiraKey: string, summary: string): string {
	const key = jiraKey.trim().toLowerCase();
	const slug = summary
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.split("-")
		.filter((w) => w.length > 0)
		.slice(0, 6)
		.join("-");
	return slug ? `${key}-${slug}` : key;
}

if (import.meta.main) {
	const key = process.argv[2];
	const summary = process.argv[3] ?? "";
	if (!key) {
		console.error("usage: change-name <JIRA-KEY> [summary]");
		process.exit(2);
	}
	console.log(changeName(key, summary));
}
