import {
	copyFile,
	lstat,
	mkdir,
	readFile,
	readdir,
	rmdir,
	unlink,
	writeFile,
} from "node:fs/promises";
import { dirname, join, relative } from "node:path";

// biome-ignore format: the workflow contract reads each invocation as one double-quoted literal
export const STORE_SYNC_INVOCATION = "scripts/store-sync.ts <installed-skills> <store-skills>";

const MANAGED = ".delivery-managed";

async function managedNames(dir: string): Promise<string[]> {
	try {
		return (await readFile(join(dir, MANAGED), "utf8"))
			.split("\n")
			.map((line) => line.trim())
			.filter((name) => name !== "" && !name.includes("/") && name !== "..");
	} catch {
		return [];
	}
}

async function filesUnder(root: string): Promise<string[]> {
	const info = await lstat(root).catch(() => null);
	if (info === null) return [];
	if (info.isFile()) return [root];
	if (!info.isDirectory()) return [];
	const found: string[] = [];
	for (const entry of await readdir(root)) {
		found.push(...(await filesUnder(join(root, entry))));
	}
	return found;
}

async function sameContent(a: string, b: string): Promise<boolean> {
	const [left, right] = await Promise.all([
		lstat(a),
		lstat(b).catch(() => null),
	]);
	if (right === null || !right.isFile() || left.size !== right.size) {
		return false;
	}
	const [x, y] = await Promise.all([readFile(a), readFile(b)]);
	return x.equals(y);
}

// Directory removal can fail on network-backed stores; an empty folder left
// behind is harmless.
async function pruneEmptyDirs(root: string): Promise<void> {
	const info = await lstat(root).catch(() => null);
	if (info === null || !info.isDirectory()) return;
	for (const entry of await readdir(root))
		await pruneEmptyDirs(join(root, entry));
	await rmdir(root).catch(() => undefined);
}

// Copies a finished install into a store that supports neither renaming
// folders nor symbolic links: files are written in place, unchanged files are
// skipped, and only files under the pack's own entries that the new install no
// longer has are deleted. Everything else in the store is left alone.
export async function syncStore(
	installed: string,
	store: string,
): Promise<{ copied: number; unchanged: number; removed: number }> {
	const names = await managedNames(installed);
	if (names.length === 0) {
		throw new Error(
			`${installed} has no ${MANAGED} list, so it is not a finished install`,
		);
	}
	const previous = await managedNames(store);
	let copied = 0;
	let unchanged = 0;
	let removed = 0;
	for (const name of names) {
		const source = join(installed, name);
		const target = join(store, name);
		const ownedBefore = await managedNames(target);
		const wanted = new Set<string>();
		for (const file of await filesUnder(source)) {
			const rel = relative(source, file);
			wanted.add(rel);
			const destination = join(target, rel);
			if (await sameContent(file, destination)) {
				unchanged += 1;
				continue;
			}
			await mkdir(dirname(destination), { recursive: true });
			await copyFile(file, destination);
			copied += 1;
		}
		// Inside a skill folder only the items its own manifest names belong to
		// the pack; run ledgers, candidates, and versions there are the user's.
		const owned = new Set([...(await managedNames(source)), ...ownedBefore]);
		const ownsAll = owned.size === 0;
		for (const file of await filesUnder(target)) {
			const rel = relative(target, file);
			if (wanted.has(rel)) continue;
			const top = rel.split(/[\\/]/)[0] ?? rel;
			if (!ownsAll && !owned.has(top) && top !== MANAGED) continue;
			await unlink(file);
			removed += 1;
		}
	}
	for (const name of previous.filter((entry) => !names.includes(entry))) {
		for (const file of await filesUnder(join(store, name))) {
			await unlink(file);
			removed += 1;
		}
		await pruneEmptyDirs(join(store, name));
	}
	await writeFile(join(store, MANAGED), `${names.join("\n")}\n`);
	return { copied, unchanged, removed };
}

if (import.meta.main) {
	const [installed, store] = process.argv.slice(2);
	if (!installed || !store) {
		console.error(`usage: ${STORE_SYNC_INVOCATION}`);
		process.exit(2);
	}
	try {
		console.log(JSON.stringify(await syncStore(installed, store)));
	} catch (error) {
		console.error(error instanceof Error ? error.message : String(error));
		process.exit(1);
	}
}
