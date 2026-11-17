import { expect, test } from "bun:test";
import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	defaultRuntimeManifest,
	parseRuntimeManifest,
} from "./runtime-manifest";
import { configureWorkItemProvider } from "./work-item-config";
import {
	createLocalWorkItem,
	listLocalWorkItems,
	noteLocalWorkItem,
	readLocalWorkItem,
	runWorkItemOperation,
} from "./work-item-provider";

async function withRoot(fn: (root: string) => Promise<void>): Promise<void> {
	const root = await mkdtemp(join(tmpdir(), "work-item-provider-"));
	try {
		await fn(root);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
}

test("local provider allocates, reads, lists, links, and updates one audit note", async () => {
	await withRoot(async (root) => {
		const runtime = defaultRuntimeManifest(true);
		await configureWorkItemProvider({
			repositoryRoot: root,
			providerId: "local-files",
			runtime,
		});
		const created = await runWorkItemOperation({
			operation: "create",
			repositoryRoot: root,
			runtime,
			input: {
				approved: true,
				auditId: "run-1:1",
				type: "bug",
				title: "Keep provider notes",
				body: "The selected provider stores one note per audit id.",
			},
		});
		expect(created).toMatchObject({ ref: "LOCAL-1", type: "bug" });
		const repeated = await createLocalWorkItem(root, {
			approved: true,
			auditId: "run-1:1",
			type: "bug",
			title: "Keep provider notes",
			body: "The selected provider stores one note per audit id.",
		});
		expect(repeated.ref).toBe("LOCAL-1");
		await expect(
			createLocalWorkItem(root, {
				approved: true,
				auditId: "run-1:1",
				title: "Conflicting replay",
				body: "Different",
			}),
		).rejects.toThrow(/different work-item content/);
		await runWorkItemOperation({
			operation: "link",
			repositoryRoot: root,
			runtime,
			input: { approved: true, ref: "LOCAL-1", blockedBy: ["LOCAL-9"] },
		});
		await runWorkItemOperation({
			operation: "note",
			repositoryRoot: root,
			runtime,
			input: { ref: "LOCAL-1", auditId: "draft:ready", body: "first" },
		});
		const noted = await noteLocalWorkItem(root, {
			ref: "LOCAL-1",
			auditId: "draft:ready",
			body: "updated",
		});
		expect(noted.blockedBy).toEqual(["LOCAL-9"]);
		expect(noted.notes).toEqual([{ auditId: "draft:ready", body: "updated" }]);
		expect(await listLocalWorkItems(root)).toHaveLength(1);
		expect((await readLocalWorkItem(root, "LOCAL-1")).title).toBe(
			"Keep provider notes",
		);
		const opaque = await createLocalWorkItem(root, {
			approved: true,
			auditId: "run-1:opaque",
			ref: "../../outside",
			title: "Opaque reference",
			body: "References do not become paths.",
		});
		expect(opaque.ref).toBe("../../outside");
		expect((await readLocalWorkItem(root, "../../outside")).title).toBe(
			"Opaque reference",
		);
		expect(await Bun.file(join(root, "outside.json")).exists()).toBe(false);
	});
});

test("local provider rejects unapproved creation and allocation lock contention", async () => {
	await withRoot(async (root) => {
		await expect(
			createLocalWorkItem(root, {
				approved: false,
				auditId: "run-1:1",
				title: "No",
				body: "No",
			}),
		).rejects.toThrow();
		await mkdir(join(root, ".delivery", "work-items", ".allocation.lock"), {
			recursive: true,
		});
		await expect(
			createLocalWorkItem(root, {
				approved: true,
				auditId: "run-1:1",
				title: "Blocked",
				body: "Blocked",
			}),
		).rejects.toThrow(/allocation is locked/);
	});
});

test("legacy markdown local items remain readable", async () => {
	await withRoot(async (root) => {
		const directory = join(root, ".delivery", "work-items");
		await mkdir(directory, { recursive: true });
		await writeFile(
			join(directory, "LOCAL-7.md"),
			[
				"---",
				"key: LOCAL-7",
				"provider: local-files",
				"blocked-by: LOCAL-2",
				"---",
				"",
				"# Legacy item",
				"",
				"Legacy body",
				"",
			].join("\n"),
		);
		expect(await readLocalWorkItem(root, "LOCAL-7")).toMatchObject({
			ref: "LOCAL-7",
			title: "Legacy item",
			blockedBy: ["LOCAL-2"],
		});
	});
});

async function fakeAdapter(root: string, body: string): Promise<string> {
	const path = join(root, "fake-provider");
	await writeFile(path, `#!/usr/bin/env bun\n${body}\n`);
	await chmod(path, 0o755);
	return path;
}

function remoteRuntime(invocation: string) {
	const base = defaultRuntimeManifest(true);
	return parseRuntimeManifest({
		version: 1,
		capabilities: {
			...base.capabilities,
			"tracker.item": {
				available: true,
				mode: "adapter",
				provider: "fake-remote",
				invocation,
			},
		},
	});
}

test("remote executable receives normalized JSON and returns validated output", async () => {
	await withRoot(async (root) => {
		const adapter = await fakeAdapter(
			root,
			`const request = JSON.parse(await Bun.stdin.text());
const operation = process.argv[2];
await Bun.stderr.write("diagnostic".repeat(100_000));
console.log(JSON.stringify({
  version: 1,
  provider: request.provider,
  ref: request.input.ref ?? "REMOTE-1",
  type: "story",
  title: operation,
  body: "normalized",
  blockedBy: [],
  notes: []
}));`,
		);
		const runtime = remoteRuntime(`exec:${adapter}`);
		await configureWorkItemProvider({
			repositoryRoot: root,
			providerId: "fake-remote",
			runtime,
		});
		expect(
			await runWorkItemOperation({
				operation: "read",
				repositoryRoot: root,
				runtime,
				input: { ref: "native:42" },
			}),
		).toMatchObject({
			provider: "fake-remote",
			ref: "native:42",
			title: "read",
		});
	});
});

test("remote protocol fails closed on opaque, malformed, and failed adapters", async () => {
	await withRoot(async (root) => {
		const assertFailure = async (invocation: string, expected: RegExp) => {
			const runtime = remoteRuntime(invocation);
			await configureWorkItemProvider({
				repositoryRoot: root,
				providerId: "fake-remote",
				runtime,
				replace: true,
			});
			await expect(
				runWorkItemOperation({
					operation: "read",
					repositoryRoot: root,
					runtime,
					input: { ref: "REMOTE-1" },
				}),
			).rejects.toThrow(expected);
		};
		await assertFailure("host:tracker", /executable bridge/);
		const malformed = await fakeAdapter(root, 'console.log("not-json")');
		await assertFailure(`exec:${malformed}`, /JSON/);
		await rm(malformed);
		const failed = await fakeAdapter(root, "process.exit(9)");
		await assertFailure(`exec:${failed}`, /exit 9/);
	});
});

test("remote executable receives the repository's settings, and none when unset", async () => {
	await withRoot(async (root) => {
		const adapter = await fakeAdapter(
			root,
			`const request = JSON.parse(await Bun.stdin.text());
console.log(JSON.stringify({
  version: 1,
  provider: request.provider,
  ref: "REMOTE-1",
  type: "story",
  title: "settings" in request ? JSON.stringify(request.settings) : "none",
  body: "normalized",
  blockedBy: [],
  notes: []
}));`,
		);
		const runtime = remoteRuntime(`exec:${adapter}`);
		const read = () =>
			runWorkItemOperation({
				operation: "read",
				repositoryRoot: root,
				runtime,
				input: { ref: "REMOTE-1" },
			});
		await configureWorkItemProvider({
			repositoryRoot: root,
			providerId: "fake-remote",
			runtime,
		});
		expect(await read()).toMatchObject({ title: "none" });
		await configureWorkItemProvider({
			repositoryRoot: root,
			providerId: "fake-remote",
			runtime,
			settings: { project: "ABC" },
		});
		expect(await read()).toMatchObject({ title: '{"project":"ABC"}' });
	});
});
