import { expect, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	initializeTargetRepository,
	withDeliveryIgnores,
} from "./delivery-init";

test("delivery ignore entries are idempotent", () => {
	const once = withDeliveryIgnores("node_modules/\n");
	const twice = withDeliveryIgnores(once);
	expect(once).toBe("node_modules/\n.delivery/\n.review/\n");
	expect(twice).toBe(once);
});

test("initializes a target repository without replacing existing ignores", async () => {
	const root = await mkdtemp(join(tmpdir(), "delivery-init-"));
	try {
		expect(await Bun.spawn(["git", "init", "-q", root]).exited).toBe(0);
		await writeFile(join(root, ".gitignore"), "node_modules/\n");
		expect(await initializeTargetRepository(root)).toBe(root);
		expect(await initializeTargetRepository(root)).toBe(root);
		expect(await readFile(join(root, ".gitignore"), "utf8")).toBe(
			"node_modules/\n.delivery/\n.review/\n",
		);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("refuses to initialize outside a git repository", async () => {
	const root = await mkdtemp(join(tmpdir(), "delivery-init-no-git-"));
	try {
		await expect(initializeTargetRepository(root)).rejects.toThrow(
			/inside the target git repository/,
		);
		expect(await Bun.file(join(root, ".gitignore")).exists()).toBe(false);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});
