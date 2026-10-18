import { expect, test } from "bun:test";
import {
	mkdir,
	mkdtemp,
	readFile,
	rm,
	symlink,
	writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	defaultRuntimeManifest,
	parseRuntimeManifest,
} from "./runtime-manifest";
import {
	WORK_ITEM_CONFIG_PATH,
	configureWorkItemProvider,
	readWorkItemSelection,
	workItemOptions,
	workItemSelectionStatus,
} from "./work-item-config";

const generic = defaultRuntimeManifest(true);
const jira = parseRuntimeManifest({
	version: 1,
	capabilities: {
		...generic.capabilities,
		"tracker.item": {
			available: true,
			mode: "adapter",
			invocation: "jira.work-items",
			provider: "jira",
		},
	},
});

async function withRepository(
	fn: (root: string) => Promise<void>,
): Promise<void> {
	const root = await mkdtemp(join(tmpdir(), "work-item-config-"));
	try {
		await fn(root);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
}

test("always offers local files and only substantiated remote providers", () => {
	expect(workItemOptions(generic).map((option) => option.id)).toEqual([
		"local-files",
	]);
	expect(workItemOptions(jira).map((option) => option.id)).toEqual([
		"local-files",
		"jira",
	]);
});

test("configures local files idempotently without a remote capability", async () => {
	await withRepository(async (root) => {
		const first = await configureWorkItemProvider({
			repositoryRoot: root,
			providerId: "local-files",
			runtime: generic,
		});
		const second = await configureWorkItemProvider({
			repositoryRoot: root,
			providerId: "local-files",
			runtime: generic,
		});
		expect(second).toEqual(first);
		expect(await readWorkItemSelection(root)).toEqual(first);
		expect(await workItemSelectionStatus(root, generic)).toMatchObject({
			state: "ready",
		});
	});
});

test("remote selection must be live and replacement must be explicit", async () => {
	await withRepository(async (root) => {
		await expect(
			configureWorkItemProvider({
				repositoryRoot: root,
				providerId: "jira",
				runtime: generic,
			}),
		).rejects.toThrow(/not available/);
		await configureWorkItemProvider({
			repositoryRoot: root,
			providerId: "jira",
			runtime: jira,
		});
		await expect(
			configureWorkItemProvider({
				repositoryRoot: root,
				providerId: "local-files",
				runtime: generic,
			}),
		).rejects.toThrow(/--replace/);
		const replacement = await configureWorkItemProvider({
			repositoryRoot: root,
			providerId: "local-files",
			runtime: generic,
			replace: true,
		});
		expect(replacement.provider.id).toBe("local-files");
	});
});

test("saved remote selection fails closed when its runtime disappears", async () => {
	await withRepository(async (root) => {
		await configureWorkItemProvider({
			repositoryRoot: root,
			providerId: "jira",
			runtime: jira,
		});
		expect(await workItemSelectionStatus(root, generic)).toMatchObject({
			state: "unavailable",
			selection: { provider: { id: "jira" } },
		});
	});
});

test("malformed configuration and symlinked state fail unchanged", async () => {
	await withRepository(async (root) => {
		await mkdir(join(root, ".delivery"), { recursive: true });
		const config = join(root, WORK_ITEM_CONFIG_PATH);
		await writeFile(config, '{"version":1}');
		await expect(readWorkItemSelection(root)).rejects.toThrow();

		await rm(config);
		const outside = join(root, "outside.json");
		await writeFile(outside, "unchanged");
		await symlink(outside, config);
		await expect(
			configureWorkItemProvider({
				repositoryRoot: root,
				providerId: "local-files",
				runtime: generic,
			}),
		).rejects.toThrow(/symlinked/);
		expect(await readFile(outside, "utf8")).toBe("unchanged");
	});
});
