import { afterEach, expect, test } from "bun:test";
import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	applyKotlinFormat,
	kotlinIdentity,
	planKotlinImports,
	planKotlinRename,
	tokenizeKotlin,
} from "./apply-kotlin-mechanical-edit";

const roots: string[] = [];

afterEach(async () => {
	for (const root of roots.splice(0)) {
		await rm(root, { recursive: true, force: true });
	}
});

async function project(files: Record<string, string>): Promise<string> {
	const root = await mkdtemp(join(tmpdir(), "kotlin-mechanical-"));
	roots.push(root);
	for (const [path, source] of Object.entries(files)) {
		await mkdir(join(root, path, ".."), { recursive: true });
		await writeFile(join(root, path), source);
	}
	return root;
}

test("the tokenizer excludes comments, strings, raw strings, and characters", () => {
	const source =
		'class Host { val text = "Name"; val raw = """Name"""; val char = \'N\'; /* Name */ fun Name() {} }';
	const identifiers = tokenizeKotlin(source)
		.filter((token) => token.kind === "identifier")
		.map((token) => token.text);
	expect(identifiers.filter((name) => name === "Name")).toEqual(["Name"]);
});

test("rename changes one declaration and its listed uses but not strings", async () => {
	const root = await project({
		"src/A.kt":
			'package demo\n\nfun slugifyTitle(value: String) = value + "slugifyTitle"\n',
		"src/B.kt": 'package demo\n\nval label = slugifyTitle("x")\n',
	});
	const result = await planKotlinRename({
		root,
		files: ["src/A.kt", "src/B.kt"],
		from: "slugifyTitle",
		to: "slugify",
	});
	expect(result).toMatchObject({ ok: true });
	expect(result.files?.["src/A.kt"]).toContain("fun slugify(");
	expect(result.files?.["src/A.kt"]).toContain('"slugifyTitle"');
	expect(result.files?.["src/B.kt"]).toContain("slugify(");
});

test("rename refuses overloads, target collisions, unlisted uses, and templates", async () => {
	const overload = await project({
		"src/A.kt": "fun run() {}\nfun run(value: Int) {}\n",
	});
	expect(
		await planKotlinRename({
			root: overload,
			files: ["src/A.kt"],
			from: "run",
			to: "execute",
		}),
	).toMatchObject({ ok: false, reason: expect.stringContaining("ambiguous") });

	const incomplete = await project({
		"src/A.kt": "fun run() {}\n",
		"src/B.kt": "val value = run()\n",
	});
	expect(
		await planKotlinRename({
			root: incomplete,
			files: ["src/A.kt"],
			from: "run",
			to: "execute",
		}),
	).toMatchObject({ ok: false, reason: expect.stringContaining("not listed") });

	const collision = await project({
		"src/A.kt": "fun run() {}\nfun execute() {}\n",
	});
	expect(
		await planKotlinRename({
			root: collision,
			files: ["src/A.kt"],
			from: "run",
			to: "execute",
		}),
	).toMatchObject({
		ok: false,
		reason: expect.stringContaining("target already exists"),
	});

	const template = await project({
		"src/A.kt": 'fun run() = "${run()}"\n',
	});
	expect(
		await planKotlinRename({
			root: template,
			files: ["src/A.kt"],
			from: "run",
			to: "execute",
		}),
	).toMatchObject({
		ok: false,
		reason: expect.stringContaining("string template"),
	});
});

test("import-only adds one unique repository type and skips ambiguity", async () => {
	const root = await project({
		"src/A.kt": "package app\n\nval widget: Widget? = null\n",
		"lib/Widget.kt": "package shared.models\n\nclass Widget\n",
	});
	const result = await planKotlinImports({ root, files: ["src/A.kt"] });
	expect(result.files?.["src/A.kt"]).toContain("import shared.models.Widget");

	await writeFile(
		join(root, "lib/Other.kt"),
		"package other.models\n\nclass Widget\n",
	);
	const ambiguous = await planKotlinImports({ root, files: ["src/A.kt"] });
	expect(ambiguous).toMatchObject({ ok: true, files: {} });
});

test("format-only needs the repo wrapper and rejects token changes", async () => {
	const root = await project({ "src/A.kt": "class Host{fun run(){}}\n" });
	expect(
		await applyKotlinFormat({
			root,
			files: ["src/A.kt"],
			run: async () => undefined,
		}),
	).toMatchObject({
		ok: false,
		reason: expect.stringContaining("bin/ktfmt"),
	});
	await mkdir(join(root, "bin"), { recursive: true });
	await writeFile(join(root, "bin/ktfmt"), "#!/bin/sh\ncat\n");
	await chmod(join(root, "bin/ktfmt"), 0o755);
	expect(
		await applyKotlinFormat({
			root,
			files: ["src/A.kt"],
			run: async (_command, source) => source.replace("Host", "Changed"),
		}),
	).toMatchObject({
		ok: false,
		reason: expect.stringContaining("non-whitespace"),
	});
	expect(kotlinIdentity("class Host { }")).toBe(
		kotlinIdentity("class   Host\n{\n}"),
	);
});
