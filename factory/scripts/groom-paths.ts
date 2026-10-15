export function slugify(title: string): string {
	const slug = title
		.toLowerCase()
		.trim()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
	return slug || "untitled";
}

export function groomOutputDir(title: string): string {
	const slug = slugify(title);
	return `.ig-spec/grooming/${slug}/`;
}

if (import.meta.main) {
	const title = process.argv[2] ?? "";
	if (!title) {
		console.error("usage: groom-paths <title>");
		process.exit(2);
	}
	console.log(
		JSON.stringify({ slug: slugify(title), dir: groomOutputDir(title) }),
	);
}
