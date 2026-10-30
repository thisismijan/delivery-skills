import { afterEach, expect, test } from "bun:test";
import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { phpIdentity, planPhpFormat } from "./apply-php-format";

const roots: string[] = [];

afterEach(async () => {
	for (const root of roots.splice(0)) {
		await rm(root, { recursive: true, force: true });
	}
});

async function project(source: string): Promise<string> {
	const root = await mkdtemp(join(tmpdir(), "php-format-"));
	roots.push(root);
	await mkdir(join(root, "src"), { recursive: true });
	await writeFile(join(root, "src/A.php"), source);
	return root;
}

async function wrapper(root: string): Promise<void> {
	await mkdir(join(root, "bin"), { recursive: true });
	await writeFile(join(root, "bin/php-format"), "#!/bin/sh\ncat\n");
	await chmod(join(root, "bin/php-format"), 0o755);
}

test("PHP identity ignores layout and comments but keeps literals and attributes", () => {
	expect(phpIdentity("<?php function run(){ # note\n return 'x'; }")).toBe(
		phpIdentity("<?php\nfunction run() {\n    return 'x';\n}"),
	);
	expect(phpIdentity("<?php return 'x';")).not.toBe(
		phpIdentity("<?php return 'y';"),
	);
	expect(phpIdentity("<?php #[Attr] function run() {}")).not.toBe(
		phpIdentity("<?php function run() {}"),
	);
});

test("PHP heredoc stays on the worker", async () => {
	const root = await project("<?php $x = <<<TXT\nhello\nTXT;\n");
	await wrapper(root);
	expect(
		await planPhpFormat({
			root,
			files: ["src/A.php"],
			run: async (_command, source) => source,
		}),
	).toMatchObject({ ok: false, reason: expect.stringContaining("not proven") });
});

test("format-only needs the repo wrapper, accepts layout, and rejects token changes", async () => {
	const root = await project("<?php function run(){return 'x';}\n");
	expect(
		await planPhpFormat({
			root,
			files: ["src/A.php"],
			run: async () => undefined,
		}),
	).toMatchObject({
		ok: false,
		reason: expect.stringContaining("bin/php-format"),
	});
	await wrapper(root);
	expect(
		await planPhpFormat({
			root,
			files: ["src/A.php"],
			run: async () => "<?php\nfunction run()\n{\n    return 'x';\n}\n",
		}),
	).toMatchObject({ ok: true });
	expect(
		await planPhpFormat({
			root,
			files: ["src/A.php"],
			run: async () => '<?php function run(){return "x";}\n',
		}),
	).toMatchObject({
		ok: false,
		reason: expect.stringContaining("non-whitespace"),
	});
});
