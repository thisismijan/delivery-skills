import { expect, test } from "bun:test";
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
import { applyMechanicalEdit } from "./apply-mechanical-edit";

const unit = {
	operation: "rename" as const,
	from: "slugifyTitle",
	to: "slugify",
	files: ["src/a.ts", "src/b.ts"],
	reversible: true,
	classificationComplete: true,
	surfaces: ["user-interface"],
	verification: "strong" as const,
};

async function withProject(
	files: Record<string, string>,
	run: (root: string) => Promise<void>,
): Promise<void> {
	const root = await mkdtemp(join(tmpdir(), "apply-mechanical-edit-"));
	try {
		await writeFile(
			join(root, "tsconfig.json"),
			JSON.stringify({
				compilerOptions: {
					strict: true,
					module: "ESNext",
					target: "ESNext",
					moduleResolution: "bundler",
					skipLibCheck: true,
					noEmit: true,
				},
				include: ["src"],
			}),
		);
		await Bun.write(join(root, "src/.keep"), "");
		for (const [path, contents] of Object.entries(files)) {
			await Bun.write(join(root, path), contents);
		}
		await run(root);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
}

test("a complete TypeScript rename is applied without a worker", async () => {
	await withProject(
		{
			"src/a.ts":
				"export function slugifyTitle(value: string): string {\n  return value;\n}\n",
			"src/b.ts":
				'import { slugifyTitle } from "./a";\nexport const label = slugifyTitle("Hello");\n',
		},
		async (root) => {
			const result = await applyMechanicalEdit({ payload: unit, root });
			expect(result).toMatchObject({
				verdict: "mechanical",
				apply: "script",
			});
			expect(await readFile(join(root, "src/a.ts"), "utf8")).toContain(
				"function slugify",
			);
			expect(await readFile(join(root, "src/a.ts"), "utf8")).not.toContain(
				"slugifyTitle",
			);
			expect(await readFile(join(root, "src/b.ts"), "utf8")).toContain(
				"slugify(",
			);
		},
	);
});

test("a complete JavaScript rename is applied without a worker", async () => {
	await withProject(
		{
			"src/a.js": "export function slugifyTitle(value) {\n  return value;\n}\n",
			"src/b.js":
				'import { slugifyTitle } from "./a";\nexport const label = slugifyTitle("Hello");\n',
		},
		async (root) => {
			const result = await applyMechanicalEdit({
				payload: { ...unit, files: ["src/a.js", "src/b.js"] },
				root,
			});
			expect(result).toMatchObject({
				verdict: "mechanical",
				apply: "script",
			});
			expect(await readFile(join(root, "src/a.js"), "utf8")).toContain(
				"function slugify",
			);
			expect(await readFile(join(root, "src/a.js"), "utf8")).not.toContain(
				"slugifyTitle",
			);
			expect(await readFile(join(root, "src/b.js"), "utf8")).toContain(
				"slugify(",
			);
		},
	);
});

test("an incomplete file list leaves files unchanged", async () => {
	await withProject(
		{
			"src/a.ts": 'export function slugifyTitle(): string { return "x"; }\n',
			"src/b.ts": 'import { slugifyTitle } from "./a";\nslugifyTitle();\n',
		},
		async (root) => {
			const beforeA = await readFile(join(root, "src/a.ts"), "utf8");
			const result = await applyMechanicalEdit({
				payload: { ...unit, files: ["src/a.ts"] },
				root,
			});
			expect(result.apply).toBe("select-model");
			expect(result.reason).toContain("not listed");
			expect(await readFile(join(root, "src/a.ts"), "utf8")).toBe(beforeA);
		},
	);
});

test("a string occurrence is not rewritten", async () => {
	await withProject(
		{
			"src/a.ts":
				'export function slugifyTitle(): string { return "slugifyTitle"; }\n',
			"src/b.ts": 'import { slugifyTitle } from "./a";\nslugifyTitle();\n',
		},
		async (root) => {
			const result = await applyMechanicalEdit({ payload: unit, root });
			expect(result.apply).toBe("script");
			expect(await readFile(join(root, "src/a.ts"), "utf8")).toContain(
				'"slugifyTitle"',
			);
			expect(await readFile(join(root, "src/a.ts"), "utf8")).toContain(
				"function slugify(",
			);
		},
	);
});

test("ambiguous symbols are not rewritten", async () => {
	await withProject(
		{
			"src/a.ts":
				'export function slugifyTitle(): string { return "a"; }\nexport const other = { slugifyTitle(): string { return "b"; } };\n',
			"src/b.ts": 'import { slugifyTitle } from "./a";\nslugifyTitle();\n',
		},
		async (root) => {
			const before = await readFile(join(root, "src/a.ts"), "utf8");
			const result = await applyMechanicalEdit({ payload: unit, root });
			expect(result.apply).toBe("select-model");
			expect(result.reason).toContain("ambiguous");
			expect(await readFile(join(root, "src/a.ts"), "utf8")).toBe(before);
		},
	);
});

test("unsupported languages keep the standard worker", async () => {
	await withProject(
		{
			"src/a.rb": "def slugify_title\n  1\nend\n",
		},
		async (root) => {
			const result = await applyMechanicalEdit({
				payload: { ...unit, files: ["src/a.rb"] },
				root,
			});
			expect(result.apply).toBe("select-model");
			expect(result.reason).toContain("supported language");
		},
	);
});

const goUnit = {
	operation: "rename" as const,
	from: "slugifyTitle",
	to: "slugify",
	files: ["src/a.go", "src/b.go"],
	reversible: true,
	classificationComplete: true,
	surfaces: ["user-interface"],
	verification: "strong" as const,
};

test("a complete unexported Go rename is applied without changing strings", async () => {
	await withProject(
		{
			"go.mod": "module example.test/app\n\ngo 1.22\n",
			"src/a.go":
				'package demo\n\nfunc slugifyTitle(value string) string { return value + "slugifyTitle" }\n',
			"src/b.go":
				'package demo\n\nfunc label() string { return slugifyTitle("Hello") }\n',
		},
		async (root) => {
			const result = await applyMechanicalEdit({ payload: goUnit, root });
			expect(result).toMatchObject({
				verdict: "mechanical",
				apply: "script",
				filesChanged: ["src/a.go", "src/b.go"],
			});
			expect(await readFile(join(root, "src/a.go"), "utf8")).toContain(
				"func slugify(",
			);
			expect(await readFile(join(root, "src/a.go"), "utf8")).toContain(
				'"slugifyTitle"',
			);
			expect(await readFile(join(root, "src/b.go"), "utf8")).toContain(
				"slugify(",
			);
		},
	);
});

test("Go rename refuses exported names, shadowing, and unlisted package files", async () => {
	await withProject(
		{
			"go.mod": "module example.test/app\n\ngo 1.22\n",
			"src/a.go": "package demo\n\nfunc slugifyTitle() {}\n",
			"src/b.go": "package demo\n\nfunc use() { slugifyTitle() }\n",
		},
		async (root) => {
			const before = await readFile(join(root, "src/a.go"), "utf8");
			const incomplete = await applyMechanicalEdit({
				payload: { ...goUnit, files: ["src/a.go"] },
				root,
			});
			expect(incomplete.apply).toBe("select-model");
			expect(incomplete.reason).toContain("not listed");
			expect(await readFile(join(root, "src/a.go"), "utf8")).toBe(before);

			const exported = await applyMechanicalEdit({
				payload: {
					...goUnit,
					from: "SlugifyTitle",
					to: "Slugify",
					files: ["src/a.go", "src/b.go"],
				},
				root,
			});
			expect(exported.apply).toBe("select-model");
			expect(exported.reason).toContain("exported");
		},
	);
	await withProject(
		{
			"go.mod": "module example.test/app\n\ngo 1.22\n",
			"src/a.go":
				"package demo\n\nfunc slugifyTitle() {}\nfunc other() { slugifyTitle := 1; _ = slugifyTitle }\n",
		},
		async (root) => {
			const result = await applyMechanicalEdit({
				payload: { ...goUnit, files: ["src/a.go"] },
				root,
			});
			expect(result.apply).toBe("select-model");
			expect(result.reason).toContain("ambiguous");
		},
	);
});

test("Go import-only removes an unused import and adds one unique local package", async () => {
	await withProject(
		{
			"go.mod": "module example.test/app\n\ngo 1.22\n",
			"src/a.go":
				'package demo\n\nimport (\n  "fmt"\n  "strings"\n)\n\nfunc label() string { fmt.Println("x"); return helper.Value() }\n',
			"helper/value.go":
				'package helper\n\nconst ValueText = "x"\nfunc Value() string { return ValueText }\n',
		},
		async (root) => {
			const result = await applyMechanicalEdit({
				payload: {
					...goUnit,
					operation: "import-only",
					files: ["src/a.go"],
				},
				root,
			});
			expect(result).toMatchObject({ apply: "script" });
			const next = await readFile(join(root, "src/a.go"), "utf8");
			expect(next).toContain('"example.test/app/helper"');
			expect(next).toContain('"fmt"');
			expect(next).not.toContain('"strings"');
		},
	);
});

test("Go import-only skips ambiguous missing imports and keeps side effects", async () => {
	await withProject(
		{
			"go.mod": "module example.test/app\n\ngo 1.22\n",
			"src/a.go":
				'package demo\n\nimport _ "example.test/app/setup"\n\nfunc label() string { return helper.Value() }\n',
			"one/value.go": 'package helper\nfunc Value() string { return "one" }\n',
			"two/value.go": 'package helper\nfunc Value() string { return "two" }\n',
			"setup/setup.go": "package setup\nfunc init() {}\n",
		},
		async (root) => {
			const result = await applyMechanicalEdit({
				payload: {
					...goUnit,
					operation: "import-only",
					files: ["src/a.go"],
				},
				root,
			});
			expect(result).toMatchObject({ apply: "script", filesChanged: [] });
			const next = await readFile(join(root, "src/a.go"), "utf8");
			expect(next).toContain('import _ "example.test/app/setup"');
			expect(next).not.toContain('"example.test/app/one"');
			expect(next).not.toContain('"example.test/app/two"');
		},
	);
});

test("Go format-only uses the standard formatter without changing tokens", async () => {
	await withProject(
		{
			"go.mod": "module example.test/app\n\ngo 1.22\n",
			"src/a.go":
				'package demo\n\nfunc label( value string ) string { return value + "literal" }\n',
		},
		async (root) => {
			const result = await applyMechanicalEdit({
				payload: {
					...goUnit,
					operation: "format-only",
					files: ["src/a.go"],
				},
				root,
			});
			expect(result).toMatchObject({
				apply: "script",
				filesChanged: ["src/a.go"],
			});
			const next = await readFile(join(root, "src/a.go"), "utf8");
			expect(next).toContain("func label(value string) string");
			expect(next).toContain('"literal"');
		},
	);
});

const pythonUnit = {
	operation: "rename" as const,
	from: "slugify_title",
	to: "slugify",
	files: ["src/a.py", "src/b.py"],
	reversible: true,
	classificationComplete: true,
	surfaces: ["user-interface"],
	verification: "strong" as const,
};

test("a complete Python rename is applied without a worker", async () => {
	await withProject(
		{
			"src/a.py": "def slugify_title(value):\n    return value\n",
			"src/b.py":
				"from a import slugify_title\nlabel = slugify_title('Hello')\n",
		},
		async (root) => {
			const result = await applyMechanicalEdit({
				payload: pythonUnit,
				root,
			});
			expect(result).toMatchObject({
				verdict: "mechanical",
				apply: "script",
			});
			expect(await readFile(join(root, "src/a.py"), "utf8")).toContain(
				"def slugify(",
			);
			expect(await readFile(join(root, "src/a.py"), "utf8")).not.toContain(
				"slugify_title",
			);
			expect(await readFile(join(root, "src/b.py"), "utf8")).toContain(
				"slugify(",
			);
		},
	);
});

test("an incomplete Python file list leaves files unchanged", async () => {
	await withProject(
		{
			"src/a.py": "def slugify_title():\n    return 'x'\n",
			"src/b.py": "from a import slugify_title\nslugify_title()\n",
		},
		async (root) => {
			const beforeA = await readFile(join(root, "src/a.py"), "utf8");
			const result = await applyMechanicalEdit({
				payload: { ...pythonUnit, files: ["src/a.py"] },
				root,
			});
			expect(result.apply).toBe("select-model");
			expect(result.reason).toContain("not listed");
			expect(await readFile(join(root, "src/a.py"), "utf8")).toBe(beforeA);
		},
	);
});

test("a Python string occurrence is not rewritten", async () => {
	await withProject(
		{
			"src/a.py": 'def slugify_title():\n    return "slugify_title"\n',
			"src/b.py": "from a import slugify_title\nslugify_title()\n",
		},
		async (root) => {
			const result = await applyMechanicalEdit({
				payload: pythonUnit,
				root,
			});
			expect(result.apply).toBe("script");
			expect(await readFile(join(root, "src/a.py"), "utf8")).toContain(
				'"slugify_title"',
			);
			expect(await readFile(join(root, "src/a.py"), "utf8")).toContain(
				"def slugify(",
			);
		},
	);
});

const javaUnit = {
	operation: "rename" as const,
	from: "SlugifyTitle",
	to: "Slugify",
	files: ["src/A.java", "src/B.java"],
	reversible: true,
	classificationComplete: true,
	surfaces: ["user-interface"],
	verification: "strong" as const,
};

test("a complete Java type rename is applied without a worker", async () => {
	await withProject(
		{
			"src/A.java":
				'public class SlugifyTitle {\n  public String value() { return "x"; }\n}\n',
			"src/B.java":
				"public class Other {\n  SlugifyTitle title = new SlugifyTitle();\n}\n",
		},
		async (root) => {
			const result = await applyMechanicalEdit({
				payload: javaUnit,
				root,
			});
			expect(result).toMatchObject({
				verdict: "mechanical",
				apply: "script",
			});
			expect(await readFile(join(root, "src/A.java"), "utf8")).toContain(
				"class Slugify ",
			);
			expect(await readFile(join(root, "src/A.java"), "utf8")).not.toContain(
				"SlugifyTitle",
			);
			expect(await readFile(join(root, "src/B.java"), "utf8")).toContain(
				"new Slugify()",
			);
		},
	);
});

test("an incomplete Java file list leaves files unchanged", async () => {
	await withProject(
		{
			"src/A.java": "public class SlugifyTitle {}\n",
			"src/B.java": "class Other { SlugifyTitle title; }\n",
		},
		async (root) => {
			const beforeA = await readFile(join(root, "src/A.java"), "utf8");
			const result = await applyMechanicalEdit({
				payload: { ...javaUnit, files: ["src/A.java"] },
				root,
			});
			expect(result.apply).toBe("select-model");
			expect(result.reason).toContain("not listed");
			expect(await readFile(join(root, "src/A.java"), "utf8")).toBe(beforeA);
		},
	);
});

test("a Java string occurrence is not rewritten", async () => {
	await withProject(
		{
			"src/A.java":
				'public class SlugifyTitle { String n = "SlugifyTitle"; }\n',
			"src/B.java": "class Other { SlugifyTitle title; }\n",
		},
		async (root) => {
			const result = await applyMechanicalEdit({
				payload: javaUnit,
				root,
			});
			expect(result.apply).toBe("script");
			expect(await readFile(join(root, "src/A.java"), "utf8")).toContain(
				'"SlugifyTitle"',
			);
			expect(await readFile(join(root, "src/A.java"), "utf8")).toContain(
				"class Slugify ",
			);
		},
	);
});

test("a unique Python parameter is applied without a worker", async () => {
	await withProject(
		{
			"src/a.py": "def slugify(value):\n    return value\n",
		},
		async (root) => {
			const result = await applyMechanicalEdit({
				payload: {
					...pythonUnit,
					from: "value",
					to: "item",
					files: ["src/a.py"],
				},
				root,
			});
			expect(result.apply).toBe("script");
			const text = await readFile(join(root, "src/a.py"), "utf8");
			expect(text).toContain("def slugify(item):");
			expect(text).toContain("return item");
			expect(text).not.toContain("value");
		},
	);
});

test("a unique Python local is applied without a worker", async () => {
	await withProject(
		{
			"src/a.py": "def slugify():\n    label = 'x'\n    return label\n",
		},
		async (root) => {
			const result = await applyMechanicalEdit({
				payload: {
					...pythonUnit,
					from: "label",
					to: "text",
					files: ["src/a.py"],
				},
				root,
			});
			expect(result.apply).toBe("script");
			const text = await readFile(join(root, "src/a.py"), "utf8");
			expect(text).toContain("text = 'x'");
			expect(text).toContain("return text");
			expect(text).not.toContain("label");
		},
	);
});

test("a Python exec use stays on the worker", async () => {
	await withProject(
		{
			"src/a.py": "def slugify(value):\n    exec(value)\n",
		},
		async (root) => {
			const before = await readFile(join(root, "src/a.py"), "utf8");
			const result = await applyMechanicalEdit({
				payload: {
					...pythonUnit,
					from: "value",
					to: "item",
					files: ["src/a.py"],
				},
				root,
			});
			expect(result.apply).toBe("select-model");
			expect(result.reason).toContain("exec");
			expect(await readFile(join(root, "src/a.py"), "utf8")).toBe(before);
		},
	);
});

test("a Python attribute of the same name stays on the worker", async () => {
	await withProject(
		{
			"src/a.py": "def slugify(value):\n    return host.value\n",
		},
		async (root) => {
			const before = await readFile(join(root, "src/a.py"), "utf8");
			const result = await applyMechanicalEdit({
				payload: {
					...pythonUnit,
					from: "value",
					to: "item",
					files: ["src/a.py"],
				},
				root,
			});
			expect(result.apply).toBe("select-model");
			expect(result.reason).toContain("attribute");
			expect(await readFile(join(root, "src/a.py"), "utf8")).toBe(before);
		},
	);
});

test("a unique Java field is applied without a worker", async () => {
	await withProject(
		{
			"src/Host.java":
				"public class Host {\n  private String slugifyTitle;\n}\n",
		},
		async (root) => {
			const result = await applyMechanicalEdit({
				payload: {
					...javaUnit,
					from: "slugifyTitle",
					to: "slugify",
					files: ["src/Host.java"],
				},
				root,
			});
			expect(result.apply).toBe("script");
			const text = await readFile(join(root, "src/Host.java"), "utf8");
			expect(text).toContain("private String slugify;");
			expect(text).not.toContain("slugifyTitle");
		},
	);
});

test("serialVersionUID stays on the worker", async () => {
	await withProject(
		{
			"src/Host.java":
				"public class Host {\n  private static final long serialVersionUID = 1L;\n}\n",
		},
		async (root) => {
			const before = await readFile(join(root, "src/Host.java"), "utf8");
			const result = await applyMechanicalEdit({
				payload: {
					...javaUnit,
					from: "serialVersionUID",
					to: "serialId",
					files: ["src/Host.java"],
				},
				root,
			});
			expect(result.apply).toBe("select-model");
			expect(await readFile(join(root, "src/Host.java"), "utf8")).toBe(before);
		},
	);
});

test("a Java type rename moves the matching file", async () => {
	await withProject(
		{
			"src/SlugifyTitle.java":
				"public class SlugifyTitle {\n  public String value() { return value(); }\n}\n",
		},
		async (root) => {
			const result = await applyMechanicalEdit({
				payload: {
					...javaUnit,
					files: ["src/SlugifyTitle.java"],
				},
				root,
			});
			expect(result.apply).toBe("script");
			expect(await readFile(join(root, "src/Slugify.java"), "utf8")).toContain(
				"class Slugify ",
			);
			await expect(
				readFile(join(root, "src/SlugifyTitle.java"), "utf8"),
			).rejects.toThrow();
		},
	);
});

test("a unique TypeScript missing import is applied without a worker", async () => {
	await withProject(
		{
			"src/a.ts":
				"export function slugify(value: string): string {\n  return value;\n}\n",
			"src/b.ts": 'export const label = slugify("Hello");\n',
		},
		async (root) => {
			const result = await applyMechanicalEdit({
				payload: {
					operation: "import-only",
					files: ["src/b.ts"],
					reversible: true,
					classificationComplete: true,
					surfaces: ["user-interface"],
					verification: "strong",
				},
				root,
			});
			expect(result.apply).toBe("script");
			const text = await readFile(join(root, "src/b.ts"), "utf8");
			expect(text).toContain("slugify");
			expect(text).toMatch(/import\s*\{?\s*slugify/);
		},
	);
});

test("an ambiguous TypeScript missing import is not added", async () => {
	await withProject(
		{
			"src/a.ts": 'export function slugify(): string { return "a"; }\n',
			"src/c.ts": 'export function slugify(): string { return "c"; }\n',
			"src/b.ts": "export const label = slugify();\n",
		},
		async (root) => {
			const before = await readFile(join(root, "src/b.ts"), "utf8");
			const result = await applyMechanicalEdit({
				payload: {
					operation: "import-only",
					files: ["src/b.ts"],
					reversible: true,
					classificationComplete: true,
					surfaces: ["user-interface"],
					verification: "strong",
				},
				root,
			});
			expect(result.apply).toBe("script");
			expect(await readFile(join(root, "src/b.ts"), "utf8")).toBe(before);
		},
	);
});

test("a repo formatter that changes names stays on the worker", async () => {
	await withProject(
		{
			"src/a.ts": 'export const label = "Hello";\n',
		},
		async (root) => {
			const bin = join(root, "node_modules", ".bin");
			await mkdir(bin, { recursive: true });
			const prettier = join(bin, "prettier");
			await writeFile(
				prettier,
				"#!/usr/bin/env python3\nimport sys\nprint(sys.stdin.read().replace('Hello', 'Goodbye'), end='')\n",
			);
			await chmod(prettier, 0o755);
			const before = await readFile(join(root, "src/a.ts"), "utf8");
			const result = await applyMechanicalEdit({
				payload: {
					operation: "format-only",
					files: ["src/a.ts"],
					reversible: true,
					classificationComplete: true,
					surfaces: ["user-interface"],
					verification: "strong",
				},
				root,
			});
			expect(result.apply).toBe("select-model");
			expect(result.reason).toContain("non-whitespace");
			expect(await readFile(join(root, "src/a.ts"), "utf8")).toBe(before);
		},
	);
});

test("a complete Java method rename is applied without a worker", async () => {
	await withProject(
		{
			"src/A.java":
				"public class Host {\n  public String slugifyTitle(String value) { return value; }\n}\n",
			"src/B.java":
				'public class Other {\n  String label = new Host().slugifyTitle("x");\n}\n',
		},
		async (root) => {
			const result = await applyMechanicalEdit({
				payload: {
					...javaUnit,
					from: "slugifyTitle",
					to: "slugify",
				},
				root,
			});
			expect(result.apply).toBe("script");
			expect(await readFile(join(root, "src/A.java"), "utf8")).toContain(
				"slugify(",
			);
			expect(await readFile(join(root, "src/A.java"), "utf8")).not.toContain(
				"slugifyTitle",
			);
			expect(await readFile(join(root, "src/B.java"), "utf8")).toContain(
				"slugify(",
			);
		},
	);
});

const pythonImportUnit = {
	operation: "import-only" as const,
	files: ["src/a.py"],
	reversible: true,
	classificationComplete: true,
	surfaces: ["user-interface"],
	verification: "strong" as const,
};

test("unused Python imports are removed without a worker", async () => {
	await withProject(
		{
			"src/a.py": "from os.path import join, dirname\nvalue = join('a', 'b')\n",
		},
		async (root) => {
			const result = await applyMechanicalEdit({
				payload: pythonImportUnit,
				root,
			});
			expect(result.apply).toBe("script");
			const text = await readFile(join(root, "src/a.py"), "utf8");
			expect(text).toContain("join(");
			expect(text).toContain("from os.path import join");
			expect(text).not.toContain("dirname");
		},
	);
});

test("a unique Python missing import is applied without a worker", async () => {
	await withProject(
		{
			"src/a.py": "def slugify(value):\n    return value\n",
			"src/b.py": "label = slugify('Hello')\n",
		},
		async (root) => {
			const result = await applyMechanicalEdit({
				payload: {
					operation: "import-only",
					files: ["src/b.py"],
					reversible: true,
					classificationComplete: true,
					surfaces: ["user-interface"],
					verification: "strong",
				},
				root,
			});
			expect(result.apply).toBe("script");
			const text = await readFile(join(root, "src/b.py"), "utf8");
			expect(text).toMatch(/from src\.a import slugify/);
			expect(text).toContain("slugify('Hello')");
		},
	);
});

test("an ambiguous Python missing import is not added", async () => {
	await withProject(
		{
			"src/a.py": "def slugify():\n    return 'a'\n",
			"src/c.py": "def slugify():\n    return 'c'\n",
			"src/b.py": "label = slugify()\n",
		},
		async (root) => {
			const before = await readFile(join(root, "src/b.py"), "utf8");
			const result = await applyMechanicalEdit({
				payload: {
					operation: "import-only",
					files: ["src/b.py"],
					reversible: true,
					classificationComplete: true,
					surfaces: ["user-interface"],
					verification: "strong",
				},
				root,
			});
			expect(result.apply).toBe("script");
			expect(await readFile(join(root, "src/b.py"), "utf8")).toBe(before);
		},
	);
});

test("a Python star import is refused", async () => {
	await withProject(
		{
			"src/a.py": "from os.path import *\nvalue = join('a', 'b')\n",
		},
		async (root) => {
			const before = await readFile(join(root, "src/a.py"), "utf8");
			const result = await applyMechanicalEdit({
				payload: pythonImportUnit,
				root,
			});
			expect(result.apply).toBe("select-model");
			expect(result.reason).toContain("star");
			expect(await readFile(join(root, "src/a.py"), "utf8")).toBe(before);
		},
	);
});

test("unused Java imports are removed without a worker", async () => {
	await withProject(
		{
			"src/A.java":
				"import java.util.List;\nimport java.util.Map;\nclass Host { List<String> values; }\n",
		},
		async (root) => {
			const result = await applyMechanicalEdit({
				payload: {
					operation: "import-only",
					files: ["src/A.java"],
					reversible: true,
					classificationComplete: true,
					surfaces: ["user-interface"],
					verification: "strong",
				},
				root,
			});
			expect(result.apply).toBe("script");
			const text = await readFile(join(root, "src/A.java"), "utf8");
			expect(text).toContain("import java.util.List;");
			expect(text).not.toContain("import java.util.Map;");
			expect(text).toContain("List<String> values");
		},
	);
});

test("a unique Java missing import is applied without a worker", async () => {
	await withProject(
		{
			"src/A.java":
				"package src;\npublic class Slugify {\n  public String value;\n}\n",
			"src/B.java": "package src.app;\nclass Host { Slugify label; }\n",
		},
		async (root) => {
			const result = await applyMechanicalEdit({
				payload: {
					operation: "import-only",
					files: ["src/B.java"],
					reversible: true,
					classificationComplete: true,
					surfaces: ["user-interface"],
					verification: "strong",
				},
				root,
			});
			expect(result.apply).toBe("script");
			const text = await readFile(join(root, "src/B.java"), "utf8");
			expect(text).toContain("import src.Slugify;");
			expect(text).toContain("Slugify label");
		},
	);
});

test("an ambiguous Java missing import is not added", async () => {
	await withProject(
		{
			"src/A.java": "package src;\npublic class Slugify {}\n",
			"src/C.java": "package src.other;\npublic class Slugify {}\n",
			"src/B.java": "package src.app;\nclass Host { Slugify label; }\n",
		},
		async (root) => {
			const before = await readFile(join(root, "src/B.java"), "utf8");
			const result = await applyMechanicalEdit({
				payload: {
					operation: "import-only",
					files: ["src/B.java"],
					reversible: true,
					classificationComplete: true,
					surfaces: ["user-interface"],
					verification: "strong",
				},
				root,
			});
			expect(result.apply).toBe("script");
			expect(await readFile(join(root, "src/B.java"), "utf8")).toBe(before);
		},
	);
});

test("a Java star import is refused", async () => {
	await withProject(
		{
			"src/A.java":
				"import java.util.*;\nclass Host { List<String> values; }\n",
		},
		async (root) => {
			const before = await readFile(join(root, "src/A.java"), "utf8");
			const result = await applyMechanicalEdit({
				payload: {
					operation: "import-only",
					files: ["src/A.java"],
					reversible: true,
					classificationComplete: true,
					surfaces: ["user-interface"],
					verification: "strong",
				},
				root,
			});
			expect(result.apply).toBe("select-model");
			expect(result.reason).toContain("star");
			expect(await readFile(join(root, "src/A.java"), "utf8")).toBe(before);
		},
	);
});

test("a TypeScript import-only rewrite is applied without a worker", async () => {
	await withProject(
		{
			"src/a.ts":
				'import { join, dirname } from "node:path";\nexport const x = join("a", "b");\n',
		},
		async (root) => {
			const result = await applyMechanicalEdit({
				payload: {
					operation: "import-only",
					files: ["src/a.ts"],
					reversible: true,
					classificationComplete: true,
					surfaces: ["user-interface"],
					verification: "strong",
				},
				root,
			});
			expect(result.apply).toBe("script");
			const text = await readFile(join(root, "src/a.ts"), "utf8");
			expect(text).toContain('from "node:path"');
			expect(text).not.toContain("dirname");
			expect(text).toContain('join("a", "b")');
		},
	);
});

test("a Python format-only rewrite is applied without a worker", async () => {
	await withProject(
		{
			"src/a.py": "def slugify(value):\n  return value\n",
		},
		async (root) => {
			const before = await readFile(join(root, "src/a.py"), "utf8");
			const result = await applyMechanicalEdit({
				payload: {
					operation: "format-only",
					files: ["src/a.py"],
					reversible: true,
					classificationComplete: true,
					surfaces: ["user-interface"],
					verification: "strong",
				},
				root,
			});
			expect(result.apply).toBe("script");
			const text = await readFile(join(root, "src/a.py"), "utf8");
			expect(text).toContain("slugify");
			expect(text).toContain("return value");
			expect(text === before || result.filesChanged.includes("src/a.py")).toBe(
				true,
			);
		},
	);
});

test("a Java format-only rewrite is applied without a worker", async () => {
	await withProject(
		{
			"src/A.java":
				"public class Host{String slugify( String value ){return value;}}\n",
		},
		async (root) => {
			const before = await readFile(join(root, "src/A.java"), "utf8");
			const result = await applyMechanicalEdit({
				payload: {
					operation: "format-only",
					files: ["src/A.java"],
					reversible: true,
					classificationComplete: true,
					surfaces: ["user-interface"],
					verification: "strong",
				},
				root,
			});
			expect(result.apply).toBe("script");
			const text = await readFile(join(root, "src/A.java"), "utf8");
			expect(text).toContain("slugify");
			expect(text).toContain("return value");
			expect(
				text === before || result.filesChanged.includes("src/A.java"),
			).toBe(true);
		},
	);
});

test("a TypeScript format-only rewrite is applied without a worker", async () => {
	await withProject(
		{
			"src/a.ts": "export function slugify(value:string){return value;}\n",
		},
		async (root) => {
			const before = await readFile(join(root, "src/a.ts"), "utf8");
			const result = await applyMechanicalEdit({
				payload: {
					operation: "format-only",
					files: ["src/a.ts"],
					reversible: true,
					classificationComplete: true,
					surfaces: ["user-interface"],
					verification: "strong",
				},
				root,
			});
			expect(result.apply).toBe("script");
			const text = await readFile(join(root, "src/a.ts"), "utf8");
			expect(text).toContain("slugify");
			expect(text).toContain("return value");
			expect(text === before || result.filesChanged.includes("src/a.ts")).toBe(
				true,
			);
		},
	);
});

test("the CLI applies a complete rename", async () => {
	await withProject(
		{
			"src/a.ts": 'export function slugifyTitle(): string { return "x"; }\n',
			"src/b.ts": 'import { slugifyTitle } from "./a";\nslugifyTitle();\n',
		},
		async (root) => {
			const inputPath = join(root, "unit.json");
			await writeFile(inputPath, JSON.stringify(unit));
			const proc = Bun.spawn(
				[
					"bun",
					join(import.meta.dir, "apply-mechanical-edit.ts"),
					inputPath,
					root,
				],
				{ stdout: "pipe", stderr: "pipe" },
			);
			expect(await proc.exited).toBe(0);
			expect(JSON.parse(await new Response(proc.stdout).text())).toMatchObject({
				apply: "script",
				filesChanged: ["src/a.ts", "src/b.ts"],
			});
		},
	);
});
