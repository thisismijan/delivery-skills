import { afterEach, expect, test } from "bun:test";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	realpathSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sandboxDoctorCheck } from "./doctor";
import {
	type EngineRun,
	SANDBOX_PATH,
	type SandboxConfig,
	type SandboxHost,
	checkSandbox,
	confirmSandbox,
	containerName,
	planSandbox,
	runSandbox,
	stopSandbox,
} from "./sandbox-run";

const roots: string[] = [];

afterEach(() => {
	for (const root of roots.splice(0)) {
		rmSync(root, { recursive: true, force: true });
	}
});

function git(cwd: string, ...args: string[]): void {
	const proc = Bun.spawnSync(["git", ...args], {
		cwd,
		stdout: "pipe",
		stderr: "pipe",
		env: {
			...process.env,
			GIT_AUTHOR_NAME: "t",
			GIT_AUTHOR_EMAIL: "t@example.invalid",
			GIT_COMMITTER_NAME: "t",
			GIT_COMMITTER_EMAIL: "t@example.invalid",
		},
	});
	if (proc.exitCode !== 0) {
		throw new Error(`git ${args.join(" ")}: ${proc.stderr.toString()}`);
	}
}

function repo(): {
	base: string;
	root: string;
	worktree: string;
	state: string;
} {
	const base = realpathSync(mkdtempSync(join(tmpdir(), "sandbox-run-")));
	roots.push(base);
	const root = join(base, "repo");
	mkdirSync(root);
	git(root, "init", "--quiet", "-b", "main");
	git(root, "config", "commit.gpgsign", "false");
	writeFileSync(join(root, "README.md"), "hello\n");
	git(root, "add", "README.md");
	git(root, "commit", "--quiet", "-m", "init");
	const worktree = join(base, "wt");
	git(root, "worktree", "add", "--quiet", "--detach", worktree);
	const state = join(base, "state");
	mkdirSync(state);
	return { base, root, worktree, state };
}

const config: SandboxConfig = {
	version: 1,
	engine: "podman",
	image: "registry.example/worker:1",
	network: "none",
	env: ["MODEL_API_TOKEN"],
	setup: [["bun", "install", "--frozen-lockfile"]],
	worker: ["agent", "--print", "/delivery auto {key}"],
	approval: {
		who: "operator",
		words: "use that sandbox",
		at: "2026-10-29T00:00:00.000Z",
	},
};

function fakeHost(options: {
	onPath?: boolean;
	image?: boolean;
	createCode?: number;
	attachedCodes?: number[];
}): SandboxHost & { calls: string[][] } {
	const calls: string[][] = [];
	const codes = [...(options.attachedCodes ?? [])];
	return {
		calls,
		which: (name) => (options.onPath === false ? null : `/usr/bin/${name}`),
		engine(argv): EngineRun {
			calls.push(argv);
			if (argv[1] === "image") {
				return {
					code: options.image === false ? 1 : 0,
					stdout: "",
					stderr: "",
				};
			}
			if (argv[1] === "run") {
				return {
					code: options.createCode ?? 0,
					stdout: "",
					stderr: options.createCode ? "no space" : "",
				};
			}
			return { code: 0, stdout: "", stderr: "" };
		},
		async attached(argv) {
			calls.push(argv);
			return codes.shift() ?? 0;
		},
		uid: () => 1000,
		gid: () => 1000,
	};
}

function plan(
	r: ReturnType<typeof repo>,
	overrides: Partial<SandboxConfig> = {},
) {
	return planSandbox({
		repoRoot: r.root,
		worktreePath: r.worktree,
		stateRoot: r.state,
		runId: "run-7",
		key: "MDF-12",
		config: { ...config, ...overrides },
		enginePath: "/usr/bin/podman",
		uid: 1000,
		gid: 1000,
		factoryRoot: r.base,
	});
}

function pairs(argv: string[], flag: string): string[] {
	return argv.flatMap((arg, index) =>
		arg === flag && argv[index + 1] ? [argv[index + 1] as string] : [],
	);
}

test("confirm refuses a config the operator did not approve or that is malformed", () => {
	const r = repo();
	const { approval: _approval, ...unapproved } = config;
	expect(() => confirmSandbox(r.root, unapproved)).toThrow();
	expect(() =>
		confirmSandbox(r.root, { ...config, env: ["DELIVERY_WORKER_JOURNAL"] }),
	).toThrow(/set by the sandbox runner/);
	expect(() =>
		confirmSandbox(r.root, { ...config, env: ["A_TOKEN", "A_TOKEN"] }),
	).toThrow(/listed once/);
	expect(() =>
		confirmSandbox(r.root, { ...config, image: "img --privileged" }),
	).toThrow(/image reference/);
	expect(() =>
		confirmSandbox(r.root, { ...config, worker: ["agent", "--print"] }),
	).toThrow(/\{key\}/);
	expect(() => confirmSandbox(r.root, { ...config, engine: "lxc" })).toThrow();
	expect(existsSync(join(r.root, SANDBOX_PATH))).toBe(false);
});

test("check falls back to plain worktrees only when nothing was confirmed", () => {
	const r = repo();
	expect(checkSandbox(r.root, fakeHost({})).state).toBe("not-configured");
	mkdirSync(join(r.root, ".delivery"), { recursive: true });
	writeFileSync(join(r.root, SANDBOX_PATH), "{not json");
	expect(checkSandbox(r.root, fakeHost({})).state).toBe("unusable");
	writeFileSync(join(r.root, SANDBOX_PATH), JSON.stringify({ version: 1 }));
	expect(checkSandbox(r.root, fakeHost({}))).toMatchObject({
		state: "unusable",
		reasons: [expect.stringContaining("malformed")],
	});
});

test("check needs the engine on PATH and the image present locally", () => {
	const r = repo();
	confirmSandbox(r.root, config);
	expect(checkSandbox(r.root, fakeHost({ onPath: false }))).toMatchObject({
		state: "unusable",
		reasons: ["podman is not on PATH."],
	});
	expect(checkSandbox(r.root, fakeHost({ image: false }))).toMatchObject({
		state: "unusable",
		reasons: [expect.stringContaining("not available locally")],
	});
	expect(checkSandbox(r.root, fakeHost({}))).toMatchObject({
		state: "ready",
		engine: "podman",
		network: "none",
	});
});

test("the plan mounts only the worktree, its git data, the state, and the pack", () => {
	const r = repo();
	const p = plan(r);
	const workers = join(r.state, "workers", "run-7");
	expect(pairs(p.create, "--volume")).toEqual([
		`${r.worktree}:${r.worktree}:rw`,
		`${join(r.root, ".git")}:${join(r.root, ".git")}:rw`,
		`${r.state}:${r.state}:ro`,
		`${workers}:${workers}:rw`,
		`${r.base}:${r.base}:ro`,
	]);
	expect(existsSync(workers)).toBe(true);
	expect(pairs(p.create, "--network")).toEqual(["none"]);
	expect(p.create).toContain("ALL");
	expect(p.create).toContain("no-new-privileges");
	expect(pairs(p.create, "--user")).toEqual(["1000:1000"]);
	expect(p.create).not.toContain("--privileged");
});

test("the plan passes only allow-listed variables by name, never their values", () => {
	const r = repo();
	const env = pairs(plan(r).create, "--env");
	expect(env).toContain("MODEL_API_TOKEN");
	expect(env).toContain(
		`DELIVERY_WORKER_JOURNAL=${join(r.state, "workers", "run-7", "MDF-12.md")}`,
	);
	expect(env).toContain(`DELIVERY_STATE_ROOT=${r.state}`);
	expect(env.filter((entry) => !entry.includes("=")).sort()).toEqual([
		"MODEL_API_TOKEN",
	]);
});

test("open network leaves the engine default; setup and the worker run inside", () => {
	const r = repo();
	const p = plan(r, { network: "open" });
	expect(p.create).not.toContain("--network");
	expect(p.setup).toEqual([
		[
			"/usr/bin/podman",
			"exec",
			"--workdir",
			r.worktree,
			"delivery-run-7-mdf-12",
			"bun",
			"install",
			"--frozen-lockfile",
		],
	]);
	expect(p.worker.slice(-3)).toEqual([
		"agent",
		"--print",
		"/delivery auto MDF-12",
	]);
	expect(p.remove).toEqual([
		"/usr/bin/podman",
		"rm",
		"--force",
		"delivery-run-7-mdf-12",
	]);
});

test("the plan refuses the main checkout, foreign repositories, and bad names", () => {
	const r = repo();
	expect(() =>
		planSandbox({
			repoRoot: r.root,
			worktreePath: r.root,
			stateRoot: r.state,
			runId: "run-7",
			key: "MDF-12",
			config,
			enginePath: "/usr/bin/podman",
			uid: 1,
			gid: 1,
		}),
	).toThrow(/main checkout/);
	const other = repo();
	expect(() =>
		planSandbox({
			repoRoot: r.root,
			worktreePath: other.worktree,
			stateRoot: r.state,
			runId: "run-7",
			key: "MDF-12",
			config,
			enginePath: "/usr/bin/podman",
			uid: 1,
			gid: 1,
		}),
	).toThrow(/not a worktree of this repository/);
	expect(() =>
		planSandbox({
			repoRoot: r.root,
			worktreePath: r.worktree,
			stateRoot: "relative/state",
			runId: "run-7",
			key: "MDF-12",
			config,
			enginePath: "/usr/bin/podman",
			uid: 1,
			gid: 1,
		}),
	).toThrow(/absolute/);
	expect(() => containerName("run 7", "MDF-12")).toThrow();
	expect(() => containerName("run-7", "mdf-12")).toThrow();
});

test("run removes the container whether setup or the worker fails or succeeds", async () => {
	const r = repo();
	const p = plan(r);
	const ok = fakeHost({ attachedCodes: [0, 0] });
	expect(await runSandbox(p, ok)).toMatchObject({ exitCode: 0, reasons: [] });
	expect(ok.calls.at(-1)).toEqual(p.remove);

	const setupFails = fakeHost({ attachedCodes: [2] });
	expect(await runSandbox(p, setupFails)).toMatchObject({
		exitCode: 1,
		reasons: ["Setup step 1 failed with exit code 2."],
	});
	expect(setupFails.calls).not.toContainEqual(p.worker);
	expect(setupFails.calls.at(-1)).toEqual(p.remove);

	const workerFails = fakeHost({ attachedCodes: [0, 137] });
	expect(await runSandbox(p, workerFails)).toMatchObject({ exitCode: 137 });
	expect(workerFails.calls.at(-1)).toEqual(p.remove);

	const noStart = fakeHost({ createCode: 125 });
	expect(await runSandbox(p, noStart)).toMatchObject({
		exitCode: 1,
		reasons: [expect.stringContaining("did not start")],
	});
	expect(noStart.calls).not.toContainEqual(p.worker);
});

test("stop removes the named container for an idle worker", () => {
	const r = repo();
	expect(() => stopSandbox(r.root, "run-7", "MDF-12", fakeHost({}))).toThrow(
		/No .delivery\/sandbox.json/,
	);
	confirmSandbox(r.root, config);
	const host = fakeHost({});
	expect(stopSandbox(r.root, "run-7", "MDF-12", host)).toEqual({
		name: "delivery-run-7-mdf-12",
		stopped: true,
	});
	expect(host.calls).toEqual([
		["/usr/bin/podman", "rm", "--force", "delivery-run-7-mdf-12"],
	]);
});

test("doctor reports the sandbox state without making it required", () => {
	const ready = sandboxDoctorCheck({
		state: "ready",
		reasons: ["Workers run in containers with no network access."],
		engine: "podman",
		image: "img:1",
		network: "none",
	});
	expect(ready).toMatchObject({ ok: true, required: false });
	expect(
		sandboxDoctorCheck({ state: "not-configured", reasons: ["none"] }),
	).toMatchObject({ ok: true, required: false });
	expect(
		sandboxDoctorCheck({
			state: "unusable",
			reasons: ["podman is not on PATH."],
		}),
	).toMatchObject({
		ok: false,
		required: false,
		category: "Needs setup",
		detail: expect.stringContaining("Parallel auto stops"),
	});
});
