import { afterEach, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sandboxLeftoversDoctorCheck } from "./doctor";
import {
	type EngineRun,
	SANDBOX_REAP_INVOCATION,
	type SandboxConfig,
	type SandboxHost,
	confirmSandbox,
	leftoverContainers,
	reapSandbox,
} from "./sandbox-run";

const roots: string[] = [];
afterEach(() => {
	for (const root of roots.splice(0))
		rmSync(root, { recursive: true, force: true });
});

const config: SandboxConfig = {
	version: 1,
	engine: "podman",
	image: "registry.example/worker:1",
	network: "none",
	env: [],
	setup: [],
	worker: ["agent", "/delivery auto {key}"],
	approval: {
		who: "operator",
		words: "use that sandbox",
		at: "2026-11-16T00:00:00.000Z",
	},
};

function repo(): string {
	const root = mkdtempSync(join(tmpdir(), "sandbox-reap-"));
	roots.push(root);
	confirmSandbox(root, config);
	return root;
}

// Containers keyed by name with their run label, as the engine would list them.
function engineWith(
	containers: Record<string, string>,
	failRemove: string[] = [],
) {
	const live = new Map(Object.entries(containers));
	const calls: string[][] = [];
	const host: SandboxHost = {
		which: (name) => `/usr/bin/${name}`,
		engine(argv): EngineRun {
			calls.push(argv);
			if (argv[1] === "ps") {
				const filter = argv[argv.indexOf("--filter") + 1] ?? "";
				const wanted = filter.startsWith("label=delivery.run=")
					? filter.slice("label=delivery.run=".length)
					: undefined;
				const names = [...live]
					.filter(([, run]) => wanted === undefined || run === wanted)
					.map(([name]) => name);
				return {
					code: 0,
					stdout: names.map((n) => `${n}\n`).join(""),
					stderr: "",
				};
			}
			if (argv[1] === "rm") {
				const name = argv.at(-1) as string;
				if (failRemove.includes(name))
					return { code: 1, stdout: "", stderr: "busy" };
				live.delete(name);
				return { code: 0, stdout: "", stderr: "" };
			}
			return { code: 0, stdout: "", stderr: "" };
		},
		async attached() {
			return 0;
		},
		uid: () => 1000,
		gid: () => 1000,
	};
	return { host, calls, live };
}

test("reap removes every container labelled for that run and nothing else", () => {
	const root = repo();
	const { host, live } = engineWith({
		"delivery-run-7-abc-12": "run-7",
		"delivery-run-7-abc-13": "run-7",
		"delivery-run-8-abc-20": "run-8",
	});
	expect(reapSandbox(root, "run-7", host)).toEqual({
		runId: "run-7",
		removed: ["delivery-run-7-abc-12", "delivery-run-7-abc-13"],
		failed: [],
	});
	expect([...live.keys()]).toEqual(["delivery-run-8-abc-20"]);
});

test("a container the engine refuses to remove is reported as failed", () => {
	const root = repo();
	const { host } = engineWith({ "delivery-run-7-abc-12": "run-7" }, [
		"delivery-run-7-abc-12",
	]);
	expect(reapSandbox(root, "run-7", host).failed).toEqual([
		"delivery-run-7-abc-12",
	]);
});

test("reap refuses a malformed run id and a repository with no sandbox", () => {
	const root = repo();
	expect(() => reapSandbox(root, "../x", engineWith({}).host)).toThrow();
	const bare = mkdtempSync(join(tmpdir(), "sandbox-reap-"));
	roots.push(bare);
	expect(() => reapSandbox(bare, "run-7", engineWith({}).host)).toThrow(
		"was confirmed",
	);
});

test("doctor names the runs that left containers behind", () => {
	const root = repo();
	const { host } = engineWith({
		"delivery-run-7-abc-12": "run-7",
		"delivery-2026-11-16-x-abc-3": "2026-11-16-x",
	});
	const byRun = leftoverContainers(root, host);
	expect(byRun).toEqual({
		"run-7": ["delivery-run-7-abc-12"],
		"2026-11-16-x": ["delivery-2026-11-16-x-abc-3"],
	});
	expect(sandboxLeftoversDoctorCheck(byRun)).toMatchObject({
		name: "Sandbox containers",
		detail: `2 sandbox containers are left from runs 2026-11-16-x, run-7. Remove them with ${SANDBOX_REAP_INVOCATION}.`,
	});
	expect(sandboxLeftoversDoctorCheck({}).detail).toBe(
		"No sandbox containers are left behind.",
	);
});

test("the reference names the reap command", () => {
	const reference = readFileSync(
		join(import.meta.dir, "..", "..", "docs", "reference.md"),
		"utf8",
	)
		.replaceAll('"$FACTORY_ROOT/scripts/', "scripts/")
		.replaceAll('.ts"', ".ts");
	expect(reference).toContain(SANDBOX_REAP_INVOCATION);
});
