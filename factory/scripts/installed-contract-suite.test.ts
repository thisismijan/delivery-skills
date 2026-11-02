import { afterEach, expect, setDefaultTimeout, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// A fresh install plus a full run of the delivery contract suite.
setDefaultTimeout(120_000);

const PACK = join(import.meta.dir, "..", "..");
const dirs: string[] = [];
afterEach(() => {
	for (const dir of dirs.splice(0))
		rmSync(dir, { recursive: true, force: true });
});

test("the delivery contract suite passes from a fresh install, skipping only checkout-only groups with a reason", async () => {
	const parent = mkdtempSync(join(tmpdir(), "installed-suite-"));
	dirs.push(parent);
	const skills = join(parent, "skills");
	const install = Bun.spawnSync(
		["bash", join(PACK, "install.sh"), "--skills-dir", skills],
		{
			cwd: PACK,
			stdout: "pipe",
			stderr: "pipe",
			env: { ...process.env, DELIVERY_INSTALL_SKIP_BUN: "1" },
		},
	);
	expect(install.exitCode, install.stderr.toString()).toBe(0);

	const proc = Bun.spawn(["bun", "test", "delivery/checks"], {
		cwd: skills,
		stdout: "pipe",
		stderr: "pipe",
		env: { ...process.env, BUN_RUNTIME_TRANSPILER_CACHE_PATH: "0" },
	});
	const [stdout, stderr, code] = await Promise.all([
		new Response(proc.stdout).text(),
		new Response(proc.stderr).text(),
		proc.exited,
	]);
	const output = `${stdout}\n${stderr}`;
	expect(code, output.slice(-4000)).toBe(0);
	expect(output).toMatch(/\b0 fail\b/);
	expect(output).not.toMatch(/\d+ errors?\b/);
	const skipped = output
		.split("\n")
		.filter((line) => line.startsWith("(skip)"));
	expect(skipped.length).toBeGreaterThan(0);
	for (const line of skipped) {
		expect(line).toContain("needs a delivery-skills checkout");
	}
});
