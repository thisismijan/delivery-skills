import { expect, test } from "bun:test";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import {
	ADAPTER_CAPABILITY_IDS,
	adapterRuntimeManifest,
	validateAdapterManifest,
} from "./adapter-contract";
import { parseRuntimeManifest } from "./runtime-manifest";
import { canStartStage } from "./stage-gating";

const packRoot = join(import.meta.dir, "..", "..");
const adaptersRoot = join(packRoot, "adapters");
const installer = readFileSync(join(packRoot, "install.sh"), "utf8");

function adapterDirs(): string[] {
	return readdirSync(adaptersRoot).filter((name) => {
		const path = join(adaptersRoot, name);
		return statSync(path).isDirectory();
	});
}

const COMPLETE_CAPABILITIES = ADAPTER_CAPABILITY_IDS.map((id) => ({
	id,
	available: id !== "mutation.guard",
	mode: id === "mutation.guard" ? "unenforced" : "native",
}));

test("validateAdapterManifest accepts a complete portable document", () => {
	expect(
		validateAdapterManifest(
			{ name: "sample", version: 1, capabilities: COMPLETE_CAPABILITIES },
			"sample",
		),
	).toEqual([]);
});

test("adapter declarations generate the runtime manifest used by stage gates", () => {
	const generated = adapterRuntimeManifest(
		{ name: "sample", version: 1, capabilities: COMPLETE_CAPABILITIES },
		"sample",
	);
	const runtime = parseRuntimeManifest(generated);
	expect(runtime.capabilities["mutation.guard"]).toMatchObject({
		available: false,
		mode: "unavailable",
		enforcement: "unenforced",
	});
	expect(runtime.capabilities["process.run"]).toMatchObject({
		available: true,
		mode: "native",
	});
});

test("static adapter declaration cannot claim mutation enforcement", () => {
	const capabilities = COMPLETE_CAPABILITIES.map((capability) =>
		capability.id === "mutation.guard"
			? { ...capability, available: true, mode: "native" }
			: capability,
	);
	const raw = { name: "sample", version: 1, capabilities };
	expect(
		adapterRuntimeManifest(raw, "sample").capabilities["mutation.guard"],
	).toMatchObject({ available: true, enforcement: "unenforced" });
	expect(
		adapterRuntimeManifest(raw, "sample", {
			mutationGuardVerified: true,
		}).capabilities["mutation.guard"],
	).toMatchObject({ available: true, enforcement: "enforced" });
});

test("validateAdapterManifest rejects a host-named incomplete document", () => {
	expect(
		validateAdapterManifest({ name: "other", version: 2 }, "sample"),
	).toEqual([
		"name must match directory 'sample'",
		"version must be 1",
		"capabilities must be an array",
	]);
});

test("every shipped adapter declares a runtime-validated manifest", () => {
	const dirs = adapterDirs();
	expect(dirs.length).toBeGreaterThan(0);
	for (const name of dirs) {
		const manifestPath = join(adaptersRoot, name, "adapter.json");
		expect(existsSync(manifestPath)).toBe(true);
		const raw = JSON.parse(readFileSync(manifestPath, "utf8")) as unknown;
		expect(validateAdapterManifest(raw, name)).toEqual([]);
	}
});

test("the shipped cursor adapter keeps mutating stages blocked", () => {
	const raw = JSON.parse(
		readFileSync(join(adaptersRoot, "cursor", "adapter.json"), "utf8"),
	) as unknown;
	const runtime = parseRuntimeManifest(adapterRuntimeManifest(raw, "cursor"));
	expect(canStartStage({ stage: "execute", runtime }).allowed).toBe(false);
});

test("adapter capability identifiers match the portable runtime contract", () => {
	expect(ADAPTER_CAPABILITY_IDS).toEqual([
		"process.run",
		"agent.dispatch",
		"model.inventory",
		"forge.change",
		"tracker.item",
		"review.publish",
		"mutation.guard",
	]);
});

test("generic installer keeps named-host flags out of the core interface", () => {
	expect(installer).toContain("--skills-dir");
	expect(installer).toContain("--adapter");
	expect(installer).not.toMatch(/hosts=\(cursor claude\)/);
	expect(installer).not.toContain("hosts+=(cursor claude store)");
	expect(installer).not.toMatch(/\$HOME\/\.cursor\/skills/);
	expect(installer).not.toMatch(/\$HOME\/\.claude\/skills/);
});

test("named-host compatibility wrappers live with their adapters", () => {
	expect(
		readFileSync(join(adaptersRoot, "cursor", "install.sh"), "utf8"),
	).toContain("--adapter cursor");
	expect(
		readFileSync(join(adaptersRoot, "cursor", "install-store.sh"), "utf8"),
	).toContain("--skills-dir");
	expect(
		readFileSync(join(adaptersRoot, "claude-code", "install.sh"), "utf8"),
	).toContain("--adapter claude-code");
	expect(readFileSync(join(adaptersRoot, "compat.sh"), "utf8")).toMatch(
		/--cursor|--claude|--store|--all/,
	);
});
