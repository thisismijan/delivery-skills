import { expect, setDefaultTimeout, test } from "bun:test";
import {
	chmod,
	mkdir,
	mkdtemp,
	readFile,
	rm,
	writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

setDefaultTimeout(20_000);

const glNote = join(
	import.meta.dir,
	"..",
	"..",
	"providers",
	"gitlab",
	"gl-note",
);
const factoryRoot = join(import.meta.dir, "..");

async function run(
	argv: string[],
	env: Record<string, string>,
	cwd: string,
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
	const proc = Bun.spawn(argv, {
		cwd,
		env: { ...process.env, ...env },
		stdout: "pipe",
		stderr: "pipe",
	});
	const [stdout, stderr, exitCode] = await Promise.all([
		new Response(proc.stdout).text(),
		new Response(proc.stderr).text(),
		proc.exited,
	]);
	return { stdout, stderr, exitCode };
}

test("gl-note calls the publication check before any network call", async () => {
	const root = await mkdtemp(join(tmpdir(), "gl-note-"));
	try {
		await run(["git", "init"], {}, root);
		const review = join(root, ".review");
		await mkdir(review, { recursive: true });
		const body = join(review, "summary.md");
		await writeFile(body, "-----BEGIN PRIVATE KEY-----\nMIIE\n");
		const bin = join(root, "bin");
		await mkdir(bin);
		const record = join(root, "network.log");
		await writeFile(record, "");
		for (const name of ["glab", "gl-mr", "curl", "jq"]) {
			const path = join(bin, name);
			await writeFile(
				path,
				`#!/usr/bin/env bash\nprintf '%s ' "$0" "$@" >>"${record}"\nprintf '\\n' >>"${record}"\nexit 0\n`,
			);
			await chmod(path, 0o755);
		}
		const result = await run(
			["bash", glNote, "12", "--file", body],
			{
				PATH: `${bin}:${process.env.PATH ?? ""}`,
				GITLAB_TOKEN: "dummy-token",
				DELIVERY_FACTORY_ROOT: factoryRoot,
				GL_TOKEN_FILE: join(root, "missing-token"),
			},
			root,
		);
		expect(result.exitCode).not.toBe(0);
		expect(await readFile(record, "utf8")).toBe("");
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});
