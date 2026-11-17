import { afterEach, expect, test } from "bun:test";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { syncStore } from "./store-sync";

const roots: string[] = [];
afterEach(() => {
	for (const root of roots.splice(0))
		rmSync(root, { recursive: true, force: true });
});
function dir() {
	const root = mkdtempSync(join(tmpdir(), "store-sync-"));
	roots.push(root);
	return root;
}
function put(root: string, path: string, text: string) {
	mkdirSync(dirname(join(root, path)), { recursive: true });
	writeFileSync(join(root, path), text);
}

test("a store is updated in place, keeping unmanaged files and dropping retired ones", async () => {
	const installed = dir();
	const store = dir();
	put(installed, ".delivery-managed", "groom\n_factory\n");
	put(installed, "groom/SKILL.md", "new groom");
	put(installed, "groom/.delivery-managed", "SKILL.md\n");
	put(installed, "_factory/scripts/a.ts", "same");
	put(installed, "_factory/scripts/b.ts", "added");
	put(store, ".delivery-managed", "groom\n_factory\nretired\n");
	put(store, "groom/SKILL.md", "old groom");
	put(store, "groom/.delivery-managed", "SKILL.md\nold-helper.md\n");
	put(store, "groom/old-helper.md", "stale managed file");
	put(store, "groom/runs/run.md", "ledger of mine");
	put(store, "_factory/scripts/a.ts", "same");
	put(store, "retired/SKILL.md", "gone");
	put(store, "my-own-skill/SKILL.md", "keep me");
	expect(await syncStore(installed, store)).toEqual({
		copied: 3,
		unchanged: 1,
		removed: 2,
	});
	expect(readFileSync(join(store, "groom/SKILL.md"), "utf8")).toBe("new groom");
	expect(readFileSync(join(store, "_factory/scripts/b.ts"), "utf8")).toBe(
		"added",
	);
	expect(existsSync(join(store, "groom/old-helper.md"))).toBe(false);
	expect(readFileSync(join(store, "groom/runs/run.md"), "utf8")).toBe(
		"ledger of mine",
	);
	expect(existsSync(join(store, "retired/SKILL.md"))).toBe(false);
	expect(readFileSync(join(store, "my-own-skill/SKILL.md"), "utf8")).toBe(
		"keep me",
	);
	expect(readFileSync(join(store, ".delivery-managed"), "utf8")).toBe(
		"groom\n_factory\n",
	);
	expect(await syncStore(installed, store)).toEqual({
		copied: 0,
		unchanged: 4,
		removed: 0,
	});
});

test("an install without a managed list is refused", async () => {
	await expect(syncStore(dir(), dir())).rejects.toThrow(
		"not a finished install",
	);
});
