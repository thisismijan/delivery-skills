import { lstat } from "node:fs/promises";
import { isAbsolute, join, relative, resolve, sep } from "node:path";

export const GROOM_ROOT = ".delivery/grooming";

const OUTSIDE_ROOT = "groom output must stay under .delivery/grooming";
const THROUGH_SYMLINK = "groom output path contains a symlink";

export function slugify(title: string): string {
	const words = title
		.toLowerCase()
		.split(/[^a-z0-9]+/)
		.filter((word) => word !== "");
	return words.join("-") || "untitled";
}

export function groomOutputDir(ticketTitle: string): string {
	return `${GROOM_ROOT}/${slugify(ticketTitle)}/`;
}

async function isSymlink(path: string): Promise<boolean> {
	try {
		return (await lstat(path)).isSymbolicLink();
	} catch (error) {
		// A directory that does not exist yet cannot redirect the write.
		if (error instanceof Error && "code" in error && error.code === "ENOENT") {
			return false;
		}
		throw error;
	}
}

export async function assertGroomPath(
	repoRoot: string,
	candidate: string,
): Promise<string> {
	const root = resolve(repoRoot, GROOM_ROOT);
	const target = resolve(repoRoot, candidate);
	const inside = relative(root, target);
	const escapes =
		inside === "" || inside === ".." || inside.startsWith(`..${sep}`);
	if (isAbsolute(candidate) || escapes) throw new Error(OUTSIDE_ROOT);
	const parents = inside.split(sep).slice(0, -1);
	let dir = root;
	for (const part of parents) {
		dir = join(dir, part);
		if (await isSymlink(dir)) throw new Error(THROUGH_SYMLINK);
	}
	return target;
}

async function main(args: string[]): Promise<number> {
	const [first, repoRoot, candidate] = args;
	if (first === "verify") {
		if (!repoRoot || !candidate) {
			console.error("usage: groom-paths verify <repo-root> <candidate>");
			return 2;
		}
		try {
			const path = await assertGroomPath(repoRoot, candidate);
			console.log(JSON.stringify({ path }));
			return 0;
		} catch (error) {
			console.error(error instanceof Error ? error.message : `${error}`);
			return 1;
		}
	}
	if (!first) {
		console.error("usage: groom-paths <title>");
		return 2;
	}
	console.log(
		JSON.stringify({ slug: slugify(first), dir: groomOutputDir(first) }),
	);
	return 0;
}

if (import.meta.main) process.exit(await main(process.argv.slice(2)));
