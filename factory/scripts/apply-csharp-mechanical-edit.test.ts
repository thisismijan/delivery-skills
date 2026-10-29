import { afterEach, expect, test } from "bun:test";
import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	applyCSharpFormat,
	csharpIdentity,
	planCSharpImports,
	planCSharpRename,
	tokenizeCSharp,
} from "./apply-csharp-mechanical-edit";

const roots: string[] = [];

afterEach(async () => {
	for (const root of roots.splice(0)) {
		await rm(root, { recursive: true, force: true });
	}
});

async function project(files: Record<string, string>): Promise<string> {
	const root = await mkdtemp(join(tmpdir(), "csharp-mechanical-"));
	roots.push(root);
	for (const [path, source] of Object.entries(files)) {
		await mkdir(join(root, path, ".."), { recursive: true });
		await writeFile(join(root, path), source);
	}
	return root;
}

test("the tokenizer excludes comments and every ordinary string form", () => {
	const source =
		'class Host { string value = "Name"; string raw = @"Name"; char c = \'N\'; /* Name */ void Name() {} }';
	const identifiers = tokenizeCSharp(source)
		.filter((token) => token.kind === "identifier")
		.map((token) => token.text);
	expect(identifiers.filter((name) => name === "Name")).toEqual(["Name"]);
});

test("rename changes one declaration and all listed identifier tokens", async () => {
	const root = await project({
		"src/A.cs":
			'namespace Demo;\nclass Host { string slugifyTitle(string value) { return value + "slugifyTitle"; } }\n',
		"src/B.cs":
			'namespace Demo;\nclass Use { string Run(Host host) { return host.slugifyTitle("x"); } }\n',
	});
	const result = await planCSharpRename({
		root,
		files: ["src/A.cs", "src/B.cs"],
		from: "slugifyTitle",
		to: "slugify",
	});
	expect(result).toMatchObject({ ok: true });
	expect(result.files?.["src/A.cs"]).toContain("string slugify(");
	expect(result.files?.["src/A.cs"]).toContain('"slugifyTitle"');
	expect(result.files?.["src/B.cs"]).toContain("host.slugify(");
});

test("rename refuses overloads, target collisions, unlisted references, and interpolation", async () => {
	const overload = await project({
		"src/A.cs":
			"class Host { void Run() {} void Run(int value) {} void Use() { Run(); } }\n",
	});
	expect(
		await planCSharpRename({
			root: overload,
			files: ["src/A.cs"],
			from: "Run",
			to: "Execute",
		}),
	).toMatchObject({ ok: false, reason: expect.stringContaining("ambiguous") });

	const incomplete = await project({
		"src/A.cs": "class Host { void Run() {} }\n",
		"src/B.cs": "class Use { void Go(Host host) { host.Run(); } }\n",
	});
	expect(
		await planCSharpRename({
			root: incomplete,
			files: ["src/A.cs"],
			from: "Run",
			to: "Execute",
		}),
	).toMatchObject({ ok: false, reason: expect.stringContaining("not listed") });

	const collision = await project({
		"src/A.cs": "class Host { void Run() {} void Execute() {} }\n",
	});
	expect(
		await planCSharpRename({
			root: collision,
			files: ["src/A.cs"],
			from: "Run",
			to: "Execute",
		}),
	).toMatchObject({
		ok: false,
		reason: expect.stringContaining("target already exists"),
	});

	const interpolation = await project({
		"src/A.cs": 'class Host { string Run() { return $"{Run()}"; } }\n',
	});
	expect(
		await planCSharpRename({
			root: interpolation,
			files: ["src/A.cs"],
			from: "Run",
			to: "Execute",
		}),
	).toMatchObject({
		ok: false,
		reason: expect.stringContaining("interpolated"),
	});
});

test("import-only adds one unique repository namespace and skips ambiguity", async () => {
	const root = await project({
		"src/A.cs": "namespace App;\nclass Host { Widget value; }\n",
		"lib/Widget.cs": "namespace Shared.Models;\npublic class Widget {}\n",
	});
	const result = await planCSharpImports({ root, files: ["src/A.cs"] });
	expect(result.files?.["src/A.cs"]).toStartWith("using Shared.Models;\n");

	await writeFile(
		join(root, "lib/Other.cs"),
		"namespace Other.Models;\npublic class Widget {}\n",
	);
	const ambiguous = await planCSharpImports({ root, files: ["src/A.cs"] });
	expect(ambiguous).toMatchObject({ ok: true, files: {} });
});

test("format-only needs the repo wrapper and refuses token changes", async () => {
	const root = await project({
		"src/A.cs": "class Host{void Run(){}}\n",
	});
	expect(
		await applyCSharpFormat({
			root,
			files: ["src/A.cs"],
			run: async () => undefined,
		}),
	).toMatchObject({
		ok: false,
		reason: expect.stringContaining("bin/csharpier"),
	});
	await mkdir(join(root, "bin"), { recursive: true });
	await writeFile(join(root, "bin/csharpier"), "#!/bin/sh\ncat\n");
	await chmod(join(root, "bin/csharpier"), 0o755);
	const changed = await applyCSharpFormat({
		root,
		files: ["src/A.cs"],
		run: async (_command, source) => source.replace("Host", "Changed"),
	});
	expect(changed).toMatchObject({
		ok: false,
		reason: expect.stringContaining("non-whitespace"),
	});
	expect(csharpIdentity("class Host { }")).toBe(
		csharpIdentity("class   Host\n{\n}"),
	);
});
