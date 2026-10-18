import { lstat, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";

export interface LocalWorkItem {
	key: string;
	title: string;
	body: string;
	blockedBy: string[];
	approved: boolean;
}

function validKey(key: string): boolean {
	return /^[A-Z][A-Z0-9]*-\d+$/.test(key);
}

export function renderLocalWorkItem(item: LocalWorkItem): string {
	if (!item.approved) {
		throw new Error("refusing to materialize an unapproved work item");
	}
	if (!validKey(item.key)) {
		throw new Error("local work-item key must match <PROJECT>-<number>");
	}
	const title = item.title.trim();
	const body = item.body.trim();
	if (!title || !body) {
		throw new Error("local work item needs a title and body");
	}
	return [
		"---",
		`key: ${item.key}`,
		"provider: local-files",
		`blocked-by: ${item.blockedBy.join(", ") || "none"}`,
		"---",
		"",
		`# ${title}`,
		"",
		body,
		"",
	].join("\n");
}

export async function materializeLocalWorkItem(
	repositoryRoot: string,
	item: LocalWorkItem,
): Promise<string> {
	const directory = join(repositoryRoot, ".delivery", "work-items");
	const path = join(directory, `${item.key}.md`);
	const content = renderLocalWorkItem(item);
	try {
		if ((await lstat(directory)).isSymbolicLink()) {
			throw new Error("refusing to write a symlinked work-item directory");
		}
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
	}
	await mkdir(directory, { recursive: true });
	try {
		const existing = await readFile(path, "utf8");
		if (existing === content) return path;
		throw new Error(`${item.key} already exists with different content`);
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
	}
	const temporary = `${path}.${process.pid}.tmp`;
	await writeFile(temporary, content, { flag: "wx", mode: 0o600 });
	await rename(temporary, path);
	return path;
}

if (import.meta.main) {
	const [command, repositoryRoot, inputPath] = process.argv.slice(2);
	if (command !== "materialize-local" || !repositoryRoot || !inputPath) {
		console.error(
			"usage: work-items.ts materialize-local <repository-root> <approved-item.json>",
		);
		process.exit(2);
	}
	try {
		const item = (await Bun.file(inputPath).json()) as LocalWorkItem;
		console.log(await materializeLocalWorkItem(repositoryRoot, item));
	} catch (error) {
		console.error(error instanceof Error ? error.message : String(error));
		process.exit(1);
	}
}
