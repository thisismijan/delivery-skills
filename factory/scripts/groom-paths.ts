import { lstat } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";

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

export async function assertGroomPath(
	repoRoot: string,
	candidate: string,
): Promise<string> {
	const base = resolve(repoRoot, ".ig-spec", "grooming");
	const target = resolve(repoRoot, candidate);
	const rel = relative(base, target);
	if (
		isAbsolute(candidate) ||
		rel === ".." ||
		rel.startsWith(`..${sep}`) ||
		rel.length === 0
	) {
		throw new Error("groom output must stay under .ig-spec/grooming");
	}
	let current = base;
	for (const segment of rel.split(sep).slice(0, -1)) {
		current = resolve(current, segment);
		try {
			if ((await lstat(current)).isSymbolicLink()) {
				throw new Error("groom output path contains a symlink");
			}
		} catch (error) {
			if (
				error instanceof Error &&
				(error.message.includes("symlink") ||
					!("code" in error) ||
					error.code !== "ENOENT")
			) {
				throw error;
			}
		}
	}
	return target;
}

if (import.meta.main) {
	if (process.argv[2] === "verify") {
		const repoRoot = process.argv[3];
		const candidate = process.argv[4];
		if (!repoRoot || !candidate) {
			console.error("usage: groom-paths verify <repo-root> <candidate>");
			process.exit(2);
		}
		try {
			console.log(
				JSON.stringify({ path: await assertGroomPath(repoRoot, candidate) }),
			);
		} catch (error) {
			console.error(error instanceof Error ? error.message : String(error));
			process.exit(1);
		}
		process.exit(0);
	}
	const title = process.argv[2] ?? "";
	if (!title) {
		console.error("usage: groom-paths <title>");
		process.exit(2);
	}
	console.log(
		JSON.stringify({ slug: slugify(title), dir: groomOutputDir(title) }),
	);
}
