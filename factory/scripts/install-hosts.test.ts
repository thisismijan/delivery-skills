import { expect, setDefaultTimeout, test } from "bun:test";

setDefaultTimeout(20_000);
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const installer = join(import.meta.dir, "..", "..", "install.sh");

test("--all skips an unwritable Cloud Agent store and still installs desktop hosts", async () => {
	const root = await mkdtemp(join(tmpdir(), "delivery-install-"));
	try {
		const cursor = join(root, "cursor-skills");
		const claude = join(root, "claude-skills");
		const store = join(root, "missing-store", "skills");
		const proc = Bun.spawn(
			["bash", installer, "--all"],
			{
				cwd: join(installer, ".."),
				env: {
					...process.env,
					CURSOR_SKILLS_DIR: cursor,
					CLAUDE_SKILLS_DIR: claude,
					CURSOR_AGENT_STORE: store,
					CURSOR_AGENT_STORE_PROBE: join(root, "missing-store"),
					DELIVERY_INSTALL_SKIP_BUN: "1",
				},
				stdout: "pipe",
				stderr: "pipe",
			},
		);
		const [stdout, stderr, exitCode] = await Promise.all([
			new Response(proc.stdout).text(),
			new Response(proc.stderr).text(),
			proc.exited,
		]);
		expect(exitCode).toBe(0);
		expect(stdout).toContain(`Cursor skills -> ${cursor}`);
		expect(stdout).toContain(`Claude Code skills -> ${claude}`);
		expect(stdout).toContain(`Agent store skipped (not writable here): ${store}`);
		expect(stderr).not.toMatch(/Read-only file system/);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});
