import { afterEach, expect, test } from "bun:test";
import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { planRustFormat, rustIdentity } from "./apply-rust-format";

const roots: string[] = [];

afterEach(async () => {
	for (const root of roots.splice(0)) {
		await rm(root, { recursive: true, force: true });
	}
});

async function project(source: string): Promise<string> {
	const root = await mkdtemp(join(tmpdir(), "rust-format-"));
	roots.push(root);
	await mkdir(join(root, "src"), { recursive: true });
	await writeFile(join(root, "src/lib.rs"), source);
	return root;
}

test("Rust identity ignores whitespace and comments but keeps literals", () => {
	expect(rustIdentity('fn run(){let text=r#"hello"#;/* note */}')).toBe(
		rustIdentity('fn run ( ) { let text = r#"hello"#; }'),
	);
	expect(rustIdentity('fn run(){let text="hello";}')).not.toBe(
		rustIdentity('fn run(){let text="changed";}'),
	);
});

test("format-only needs repo-local rustfmt", async () => {
	const root = await project("pub fn run( ){ }\n");
	expect(
		await planRustFormat({
			root,
			files: ["src/lib.rs"],
			run: async () => undefined,
		}),
	).toMatchObject({
		ok: false,
		reason: expect.stringContaining("bin/rustfmt"),
	});
});

test("format-only accepts whitespace-only output and rejects token changes", async () => {
	const root = await project("pub fn run( ){ }\n");
	await mkdir(join(root, "bin"));
	await writeFile(join(root, "bin/rustfmt"), "#!/bin/sh\ncat\n");
	await chmod(join(root, "bin/rustfmt"), 0o755);
	expect(
		await planRustFormat({
			root,
			files: ["src/lib.rs"],
			run: async () => "pub fn run() {}\n",
		}),
	).toMatchObject({
		ok: true,
		files: { "src/lib.rs": "pub fn run() {}\n" },
	});
	expect(
		await planRustFormat({
			root,
			files: ["src/lib.rs"],
			run: async () => "pub fn changed() {}\n",
		}),
	).toMatchObject({
		ok: false,
		reason: expect.stringContaining("non-whitespace"),
	});
});
