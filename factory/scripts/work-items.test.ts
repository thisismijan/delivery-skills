import { expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { materializeLocalWorkItem, renderLocalWorkItem } from "./work-items";

const item = {
	key: "LOCAL-1",
	title: "Persist the selected provider",
	body: "As an operator, I can reuse the confirmed repository choice.",
	blockedBy: [],
	approved: true,
};

test("local work items require explicit approval and normalized keys", () => {
	expect(() => renderLocalWorkItem({ ...item, approved: false })).toThrow(
		/unapproved/,
	);
	expect(() => renderLocalWorkItem({ ...item, key: "../escape" })).toThrow(
		/<PROJECT>-<number>/,
	);
});

test("materializes an approved local work item idempotently", async () => {
	const root = await mkdtemp(join(tmpdir(), "local-work-items-"));
	try {
		const first = await materializeLocalWorkItem(root, item);
		const second = await materializeLocalWorkItem(root, item);
		expect(second).toBe(first);
		expect(await readFile(first, "utf8")).toContain("provider: local-files");
		await expect(
			materializeLocalWorkItem(root, { ...item, title: "Different" }),
		).rejects.toThrow(/different content/);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});
