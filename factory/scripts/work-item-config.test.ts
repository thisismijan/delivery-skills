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
	parseSettingArguments,
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
	expect(workItemOptions(generic, ["jira"]).map((option) => option.id)).toEqual(
		["local-files", "jira"],
	);
	expect(workItemOptions(generic, ["jira"])[1]?.invocation).toBe("mcp");
});

test("MCP Jira records its site because host tools require cloudId", async () => {
	await withRepository(async (root) => {
		const runtimeDir = join(root, ".delivery", "runtime");
		await mkdir(runtimeDir, { recursive: true });
		await writeFile(
			join(runtimeDir, "mcp-inventory.json"),
			JSON.stringify({
				version: 1,
				recordedAt: "2026-10-20T12:45:00.000Z",
				tools: [
					{ server: "Atlassian", name: "getJiraIssue" },
					{ server: "Atlassian", name: "searchJiraIssuesUsingJql" },
					{ server: "Atlassian", name: "createJiraIssue" },
					{ server: "Atlassian", name: "addGraphContext" },
					{
						server: "Atlassian",
						name: "addOrEditJiraIssueComment",
					},
				],
			}),
		);
		await configureWorkItemProvider({
			repositoryRoot: root,
			providerId: "jira",
			runtime: generic,
			settings: { project: "DEL" },
		});
		expect(await workItemSelectionStatus(root, generic)).toMatchObject({
			state: "unavailable",
			remedy: expect.stringContaining("--setting site=<value>"),
		});
		await configureWorkItemProvider({
			repositoryRoot: root,
			providerId: "jira",
			runtime: generic,
			settings: {
				project: "DEL",
				site: "https://example.atlassian.net",
			},
		});
		expect(await workItemSelectionStatus(root, generic)).toMatchObject({
			state: "ready",
		});
	});
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

test("a Jira repository is not ready until it records its own project", async () => {
	await withRepository(async (root) => {
		await configureWorkItemProvider({
			repositoryRoot: root,
			providerId: "jira",
			runtime: jira,
		});
		const unset = await workItemSelectionStatus(root, jira);
		expect(unset.state).toBe("unavailable");
		expect(unset.remedy).toContain(
			"delivery init --work-items jira --setting project=<value>",
		);
		// Adding a setting the repository never recorded needs no --replace.
		await configureWorkItemProvider({
			repositoryRoot: root,
			providerId: "jira",
			runtime: jira,
			settings: { project: "MDF" },
		});
		expect(await workItemSelectionStatus(root, jira)).toMatchObject({
			state: "ready",
			selection: { provider: { id: "jira", settings: { project: "MDF" } } },
		});
		expect(
			JSON.parse(await readFile(join(root, WORK_ITEM_CONFIG_PATH), "utf8")),
		).toEqual({
			version: 1,
			provider: { id: "jira", kind: "remote", settings: { project: "MDF" } },
			confirmed: true,
		});
	});
});

test("changing a recorded project needs --replace, and re-recording it is idempotent", async () => {
	await withRepository(async (root) => {
		const configure = (project: string, replace?: boolean) =>
			configureWorkItemProvider({
				repositoryRoot: root,
				providerId: "jira",
				runtime: jira,
				settings: { project },
				replace,
			});
		const first = await configure("MDF");
		expect(await configure("MDF")).toEqual(first);
		await expect(configure("OTHER")).rejects.toThrow(
			/setting project is already MDF; pass --replace/,
		);
		expect((await readWorkItemSelection(root))?.provider.settings).toEqual({
			project: "MDF",
		});
		const replaced = await configure("OTHER", true);
		expect(replaced.provider.settings).toEqual({ project: "OTHER" });
	});
});

test("a linked worktree inherits its checkout's selection", async () => {
	await withRepository(async (root) => {
		const primary = join(root, "primary");
		const worktree = join(root, "worktree");
		await mkdir(primary);
		const git = (...args: string[]) => {
			const result = Bun.spawnSync(["git", ...args], {
				cwd: primary,
				stdout: "pipe",
				stderr: "pipe",
				env: {
					...process.env,
					GIT_AUTHOR_NAME: "t",
					GIT_AUTHOR_EMAIL: "t@example.test",
					GIT_COMMITTER_NAME: "t",
					GIT_COMMITTER_EMAIL: "t@example.test",
				},
			});
			expect(result.exitCode).toBe(0);
		};
		git("init", "-q");
		git("commit", "-q", "--allow-empty", "-m", "init");
		git("worktree", "add", "-q", "--detach", worktree);
		await configureWorkItemProvider({
			repositoryRoot: primary,
			providerId: "jira",
			runtime: jira,
			settings: { project: "MDF" },
		});
		expect(await readWorkItemSelection(worktree)).toEqual(
			await readWorkItemSelection(primary),
		);
		expect(await workItemSelectionStatus(worktree, jira)).toMatchObject({
			state: "ready",
		});
	});
});

test("settings are validated and local files take none", async () => {
	expect(
		parseSettingArguments(["--replace", "--setting", "project=MDF"]),
	).toEqual({ project: "MDF" });
	expect(() => parseSettingArguments(["--setting", "project"])).toThrow(
		/key=value/,
	);
	expect(() =>
		parseSettingArguments(["--setting", "project=A", "--setting", "project=B"]),
	).toThrow(/given twice/);
	expect(() =>
		parseSettingArguments(["--setting", "project=A\u0007"]),
	).toThrow();
	await withRepository(async (root) => {
		await expect(
			configureWorkItemProvider({
				repositoryRoot: root,
				providerId: "local-files",
				runtime: generic,
				settings: { project: "MDF" },
			}),
		).rejects.toThrow(/takes no settings/);
	});
});
