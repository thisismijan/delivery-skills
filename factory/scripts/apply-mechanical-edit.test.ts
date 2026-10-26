import { expect, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
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
			"src/a.py":
				"from os.path import join, dirname\nvalue = join('a', 'b')\n",
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
