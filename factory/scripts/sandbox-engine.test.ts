import { afterAll, expect, setDefaultTimeout, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	SANDBOX_ENGINES,
	type SandboxConfig,
	confirmSandbox,
	containerName,
	leftoverContainers,
	realHost,
	reapSandbox,
} from "./sandbox-run";

setDefaultTimeout(120_000);

// Set to "required" where a job promises an engine, so a missing one fails
// instead of skipping.
const ENGINE_TEST_ENV = "DELIVERY_SANDBOX_ENGINE_TEST";
const ENGINE_TEST_IMAGES = [
	"docker.io/library/busybox:1.36",
	"busybox:1.36",
	"busybox",
	"docker.io/library/alpine:3",
	"alpine",
];

function run(argv: string[]) {
	const proc = Bun.spawnSync(argv, { stdout: "pipe", stderr: "pipe" });
	return {
		code: proc.exitCode ?? 1,
		stdout: proc.stdout.toString(),
		stderr: proc.stderr.toString(),
	};
}

function findEngine(): {
	engine: (typeof SANDBOX_ENGINES)[number];
	path: string;
	image: string;
} | null {
	for (const engine of SANDBOX_ENGINES) {
		const path = Bun.which(engine);
		if (!path) continue;
		const image = ENGINE_TEST_IMAGES.find(
			(candidate) => run([path, "image", "inspect", candidate]).code === 0,
		);
		if (image) return { engine, path, image };
	}
	return null;
}

const found = findEngine();
const required = process.env[ENGINE_TEST_ENV] === "required";
const suffix = Date.now().toString(36);
const runA = `engine-a-${suffix}`;
const runB = `engine-b-${suffix}`;
const started: string[] = [];
const roots: string[] = [];

afterAll(() => {
	if (found)
		for (const name of started) run([found.path, "rm", "--force", name]);
	for (const root of roots) rmSync(root, { recursive: true, force: true });
});

test("an engine is present wherever this test is required", () => {
	if (required) expect(found).not.toBeNull();
});

test.skipIf(found === null)(
	`reaping one run removes only that run's containers on a real engine${found ? "" : " (skipped: no docker or podman with a local busybox or alpine image)"}`,
	() => {
		if (!found) return;
		const root = mkdtempSync(join(tmpdir(), "sandbox-engine-"));
		roots.push(root);
		const config: SandboxConfig = {
			version: 1,
			engine: found.engine,
			image: found.image,
			network: "none",
			env: [],
			setup: [],
			worker: ["echo", "{key}"],
			approval: {
				who: "operator",
				words: "use that sandbox",
				at: "2026-11-17T00:00:00.000Z",
			},
		};
		confirmSandbox(root, config);
		for (const [runId, key] of [
			[runA, "WORK-1"],
			[runA, "WORK-2"],
			[runB, "WORK-3"],
		] as const) {
			const name = containerName(runId, key);
			const created = run([
				found.path,
				"run",
				"--detach",
				"--network",
				"none",
				"--name",
				name,
				"--label",
				`delivery.run=${runId}`,
				"--label",
				`delivery.key=${key}`,
				found.image,
				"sleep",
				"300",
			]);
			expect([name, created.code, created.stderr]).toEqual([
				name,
				0,
				expect.any(String),
			]);
			started.push(name);
		}
		const before = leftoverContainers(root, realHost);
		expect(before[runA]?.sort()).toEqual(
			[containerName(runA, "WORK-1"), containerName(runA, "WORK-2")].sort(),
		);
		expect(before[runB]).toEqual([containerName(runB, "WORK-3")]);

		const result = reapSandbox(root, runA, realHost);
		expect(result.removed.sort()).toEqual(
			[containerName(runA, "WORK-1"), containerName(runA, "WORK-2")].sort(),
		);
		expect(result.failed).toEqual([]);
		const after = leftoverContainers(root, realHost);
		expect(after[runA]).toBeUndefined();
		expect(after[runB]).toEqual([containerName(runB, "WORK-3")]);
	},
);
