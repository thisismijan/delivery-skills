import { expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import {
	ADAPTER_CAPABILITY_IDS,
	validateAdapterManifest,
} from "./adapter-contract";

const packRoot = join(import.meta.dir, "..", "..");
const adaptersRoot = join(packRoot, "adapters");
const installer = readFileSync(join(packRoot, "install.sh"), "utf8");

function adapterDirs(): string[] {
	return readdirSync(adaptersRoot).filter((name) => {
		const path = join(adaptersRoot, name);
		return statSync(path).isDirectory();
	});
}

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
	expect(installer).not.toContain('hosts+=(cursor claude store)');
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
	expect(
		readFileSync(join(adaptersRoot, "compat.sh"), "utf8"),
	).toMatch(/--cursor|--claude|--store|--all/);
});
