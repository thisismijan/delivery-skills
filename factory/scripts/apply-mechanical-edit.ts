import { existsSync } from "node:fs";
import { readdir, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import * as ts from "typescript";
import { z } from "zod";
import {
	applyCSharpFormat,
	planCSharpImports,
	planCSharpRename,
	writeCSharpPlan,
} from "./apply-csharp-mechanical-edit";
import {
	javaFormatIdentityHolds,
	planJavaFormat,
	planJavaImports,
	planJavaRename,
} from "./apply-java-mechanical-edit";
import {
	applyKotlinFormat,
	planKotlinImports,
	planKotlinRename,
	writeKotlinPlan,
} from "./apply-kotlin-mechanical-edit";
import {
	type MechanicalEditPlan,
	classifyMechanicalEdit,
} from "./mechanical-edit";

const TYPESCRIPT_EXTENSIONS = new Set([
	".ts",
	".tsx",
	".mts",
	".cts",
	".js",
	".jsx",
	".mjs",
	".cjs",
]);
const PYTHON_EXTENSIONS = new Set([".py", ".pyi"]);
const JAVA_EXTENSIONS = new Set([".java"]);
const GO_EXTENSIONS = new Set([".go"]);
const CSHARP_EXTENSIONS = new Set([".cs"]);
const KOTLIN_EXTENSIONS = new Set([".kt", ".kts"]);
const SKIP_DIRS = new Set(["node_modules", "dist", ".git"]);

type ApplyLanguage =
	| "typescript"
	| "python"
	| "java"
	| "go"
	| "csharp"
	| "kotlin";

function extensionOf(fileName: string): string {
	const dot = fileName.lastIndexOf(".");
	return dot < 0 ? "" : fileName.slice(dot);
}

function languageOf(fileName: string): ApplyLanguage | undefined {
	const extension = extensionOf(fileName);
	if (TYPESCRIPT_EXTENSIONS.has(extension)) {
		return "typescript";
	}
	if (PYTHON_EXTENSIONS.has(extension)) {
		return "python";
	}
	if (JAVA_EXTENSIONS.has(extension)) {
		return "java";
	}
	if (GO_EXTENSIONS.has(extension)) {
		return "go";
	}
	if (CSHARP_EXTENSIONS.has(extension)) {
		return "csharp";
	}
	if (KOTLIN_EXTENSIONS.has(extension)) {
		return "kotlin";
	}
	return undefined;
}

export interface ApplyMechanicalEditResult extends MechanicalEditPlan {
	filesChanged: string[];
}

interface RenameEdit {
	fileName: string;
	start: number;
	end: number;
	text: string;
}

function hasTypeScriptExtension(fileName: string): boolean {
	return languageOf(fileName) === "typescript";
}

function plan(
	base: MechanicalEditPlan,
	reason: string,
	filesChanged: string[] = [],
): ApplyMechanicalEditResult {
	return {
		verdict: base.verdict,
		reason,
		apply: "select-model",
		filesChanged,
	};
}

function identifierPositions(
	fileName: string,
	source: string,
	name: string,
): number[] {
	const sf = ts.createSourceFile(
		fileName,
		source,
		ts.ScriptTarget.Latest,
		true,
		ts.ScriptKind.TSX,
	);
	const positions: number[] = [];
	const visit = (node: ts.Node): void => {
		if (ts.isIdentifier(node) && node.text === name) {
			positions.push(node.getStart(sf));
		}
		ts.forEachChild(node, visit);
	};
	visit(sf);
	return positions;
}

function hasIdentifier(source: string, name: string): boolean {
	return identifierPositions("probe.ts", source, name).length > 0;
}

function originalSymbol(
	checker: ts.TypeChecker,
	node: ts.Node,
): ts.Symbol | undefined {
	const symbol = checker.getSymbolAtLocation(node);
	if (!symbol) {
		return undefined;
	}
	if (symbol.flags & ts.SymbolFlags.Alias) {
		return checker.getAliasedSymbol(symbol);
	}
	return symbol;
}

function identifierAt(
	sourceFile: ts.SourceFile,
	position: number,
): ts.Identifier | undefined {
	const visit = (node: ts.Node): ts.Identifier | undefined => {
		if (ts.isIdentifier(node) && node.getStart(sourceFile) === position) {
			return node;
		}
		return ts.forEachChild(node, visit);
	};
	return visit(sourceFile);
}

async function listTypeScriptFiles(root: string): Promise<string[]> {
	const files: string[] = [];
	const walk = async (dir: string): Promise<void> => {
		const entries = await readdir(dir, { withFileTypes: true });
		for (const entry of entries) {
			if (SKIP_DIRS.has(entry.name)) {
				continue;
			}
			const full = join(dir, entry.name);
			if (entry.isDirectory()) {
				await walk(full);
				continue;
			}
			if (languageOf(entry.name) === "typescript") {
				files.push(resolve(full));
			}
		}
	};
	await walk(root);
	return files;
}

function compilerOptionsFromConfig(root: string): {
	options: ts.CompilerOptions;
	fileNames: string[] | undefined;
} {
	const configPath = ts.findConfigFile(
		root,
		ts.sys.fileExists,
		"tsconfig.json",
	);
	if (!configPath) {
		return {
			options: {
				target: ts.ScriptTarget.ESNext,
				module: ts.ModuleKind.ESNext,
				moduleResolution: ts.ModuleResolutionKind.Bundler,
				strict: true,
				skipLibCheck: true,
				noEmit: true,
				jsx: ts.JsxEmit.ReactJSX,
			},
			fileNames: undefined,
		};
	}
	const configFile = ts.readConfigFile(configPath, ts.sys.readFile);
	if (configFile.error) {
		return {
			options: { skipLibCheck: true, noEmit: true },
			fileNames: undefined,
		};
	}
	const parsed = ts.parseJsonConfigFileContent(
		configFile.config,
		ts.sys,
		dirname(configPath),
	);
	return {
		options: parsed.options,
		fileNames: parsed.fileNames.map((file) => resolve(file)),
	};
}

function createLanguageService(
	root: string,
	fileNames: string[],
	options: ts.CompilerOptions,
	contents?: Map<string, string>,
): ts.LanguageService {
	const snapshots = new Map<string, ts.IScriptSnapshot>();
	const host: ts.LanguageServiceHost = {
		getCompilationSettings: () => ({ ...options, allowJs: true }),
		getScriptFileNames: () => fileNames,
		getScriptVersion: () => "1",
		getScriptSnapshot: (fileName) => {
			const resolved = resolve(fileName);
			const existing = snapshots.get(resolved) ?? snapshots.get(fileName);
			if (existing) {
				return existing;
			}
			const text = contents?.get(resolved) ?? ts.sys.readFile(fileName);
			if (text === undefined) {
				return undefined;
			}
			const snapshot = ts.ScriptSnapshot.fromString(text);
			snapshots.set(resolved, snapshot);
			return snapshot;
		},
		getCurrentDirectory: () => root,
		getDefaultLibFileName: (opts) => ts.getDefaultLibFilePath(opts),
		fileExists: ts.sys.fileExists,
		readFile: (fileName) =>
			contents?.get(resolve(fileName)) ?? ts.sys.readFile(fileName),
		readDirectory: ts.sys.readDirectory,
		directoryExists: ts.sys.directoryExists,
		getDirectories: ts.sys.getDirectories,
	};
	return ts.createLanguageService(host);
}

function editsOverlap(edits: RenameEdit[]): boolean {
	const byFile = new Map<string, RenameEdit[]>();
	for (const edit of edits) {
		const list = byFile.get(edit.fileName) ?? [];
		list.push(edit);
		byFile.set(edit.fileName, list);
	}
	for (const list of byFile.values()) {
		const ordered = [...list].sort((a, b) => a.start - b.start);
		for (let index = 1; index < ordered.length; index += 1) {
			const previous = ordered[index - 1];
			const current = ordered[index];
			if (!previous || !current) {
				continue;
			}
			if (current.start < previous.end) {
				return true;
			}
		}
	}
	return false;
}

function applyEditsToText(source: string, edits: RenameEdit[]): string {
	const ordered = [...edits].sort((a, b) => b.start - a.start);
	let next = source;
	for (const edit of ordered) {
		next = `${next.slice(0, edit.start)}${edit.text}${next.slice(edit.end)}`;
	}
	return next;
}

const PythonRenameResult = z.object({
	ok: z.boolean(),
	reason: z.string().optional(),
	files: z.record(z.string()).optional(),
});

async function applyGoEdit(
	classified: MechanicalEditPlan,
	payload: {
		operation: string;
		from?: string;
		to?: string;
		files: string[];
	},
	root: string,
	listed: string[],
	appliedReason: string,
): Promise<ApplyMechanicalEditResult> {
	const inputPath = join(
		tmpdir(),
		`apply-go-mechanical-edit-${Date.now()}.json`,
	);
	await writeFile(inputPath, JSON.stringify(payload), "utf8");
	try {
		const proc = Bun.spawn(
			[
				"go",
				"run",
				join(import.meta.dir, "go-mechanical-edit.go"),
				root,
				inputPath,
			],
			{ stdout: "pipe", stderr: "pipe" },
		);
		const exit = await proc.exited;
		const stdout = await new Response(proc.stdout).text();
		if (exit !== 0) {
			return plan(classified, "go helper failed");
		}
		const parsed = PythonRenameResult.safeParse(JSON.parse(stdout));
		if (!parsed.success || !parsed.data.ok || !parsed.data.files) {
			return plan(
				classified,
				parsed.success
					? (parsed.data.reason ?? "go rewrite was not proven")
					: "go helper returned invalid JSON",
			);
		}
		const listedSet = new Set(listed);
		const written: string[] = [];
		for (const [relativePath, text] of Object.entries(parsed.data.files)) {
			const fileName = resolve(root, relativePath);
			if (!listedSet.has(fileName)) {
				return plan(classified, "go helper wrote an unlisted file");
			}
			const original = await Bun.file(fileName).text();
			if (text === original) continue;
			await writeFile(fileName, text, "utf8");
			written.push(relativePath.split(sep).join("/"));
		}
		return {
			verdict: "mechanical",
			reason: appliedReason,
			apply: "script",
			filesChanged: written.sort(),
		};
	} finally {
		await Bun.file(inputPath)
			.delete()
			.catch(() => undefined);
	}
}

async function applyCSharpPlan(
	classified: MechanicalEditPlan,
	root: string,
	planned: Awaited<ReturnType<typeof planCSharpRename>>,
	reason: string,
): Promise<ApplyMechanicalEditResult> {
	if (!planned.ok || !planned.files) {
		return plan(classified, planned.reason ?? "csharp rewrite was not proven");
	}
	const filesChanged = await writeCSharpPlan(root, planned);
	return {
		verdict: "mechanical",
		reason,
		apply: "script",
		filesChanged,
	};
}

async function applyKotlinPlan(
	classified: MechanicalEditPlan,
	root: string,
	planned: Awaited<ReturnType<typeof planKotlinRename>>,
	reason: string,
): Promise<ApplyMechanicalEditResult> {
	if (!planned.ok || !planned.files) {
		return plan(classified, planned.reason ?? "kotlin rewrite was not proven");
	}
	return {
		verdict: "mechanical",
		reason,
		apply: "script",
		filesChanged: await writeKotlinPlan(root, planned),
	};
}

async function applyPythonEdit(
	classified: MechanicalEditPlan,
	payload: {
		operation: string;
		from?: string;
		to?: string;
		files: string[];
		proposed?: Record<string, string>;
	},
	root: string,
	listed: string[],
	appliedReason: string,
): Promise<ApplyMechanicalEditResult> {
	const inputPath = join(
		tmpdir(),
		`apply-python-mechanical-edit-${Date.now()}.json`,
	);
	await writeFile(inputPath, JSON.stringify(payload), "utf8");
	try {
		const proc = Bun.spawn(
			[
				"python3",
				join(import.meta.dir, "python-mechanical-edit.py"),
				root,
				inputPath,
			],
			{ stdout: "pipe", stderr: "pipe" },
		);
		const exit = await proc.exited;
		const stdout = await new Response(proc.stdout).text();
		if (exit !== 0) {
			return plan(classified, "python helper failed");
		}
		const parsed = PythonRenameResult.safeParse(JSON.parse(stdout));
		if (!parsed.success || !parsed.data.ok || !parsed.data.files) {
			return plan(
				classified,
				parsed.success
					? (parsed.data.reason ?? "python rewrite was not proven")
					: "python helper returned invalid JSON",
			);
		}
		const listedSet = new Set(listed);
		const written: string[] = [];
		for (const [relativePath, text] of Object.entries(parsed.data.files)) {
			const fileName = resolve(root, relativePath);
			if (!listedSet.has(fileName)) {
				return plan(classified, "python helper wrote an unlisted file");
			}
			await writeFile(fileName, text, "utf8");
			written.push(relativePath.split(sep).join("/"));
		}
		return {
			verdict: "mechanical",
			reason: appliedReason,
			apply: "script",
			filesChanged: written.sort(),
		};
	} finally {
		await Bun.file(inputPath)
			.delete()
			.catch(() => undefined);
	}
}

async function applyJavaRename(
	classified: MechanicalEditPlan,
	payload: { from?: string; to?: string; files: string[] },
	root: string,
	listed: string[],
): Promise<ApplyMechanicalEditResult> {
	if (!payload.from || !payload.to) {
		return plan(classified, "rename requires from and to identifiers");
	}
	const planned = await planJavaRename({
		root,
		from: payload.from,
		to: payload.to,
		files: payload.files,
	});
	if (!planned.ok || !planned.files) {
		return plan(classified, planned.reason ?? "java rename was not proven");
	}
	const listedSet = new Set(listed);
	const written: string[] = [];
	for (const [relativePath, text] of Object.entries(planned.files)) {
		const fileName = resolve(root, relativePath);
		const allowed =
			listedSet.has(fileName) ||
			(basename(fileName) === `${payload.to}.java` &&
				listed.some(
					(listedFile) =>
						basename(listedFile) === `${payload.from}.java` &&
						dirname(listedFile) === dirname(fileName),
				));
		if (!allowed) {
			return plan(classified, "java helper wrote an unlisted file");
		}
		await writeFile(fileName, text, "utf8");
		written.push(relativePath);
	}
	for (const relativePath of planned.remove ?? []) {
		await unlink(resolve(root, relativePath)).catch(() => undefined);
		if (!written.includes(relativePath)) {
			written.push(relativePath);
		}
	}
	return {
		verdict: "mechanical",
		reason: "applied Java identifier rename",
		apply: "script",
		filesChanged: written.sort(),
	};
}

async function applyJavaImports(
	classified: MechanicalEditPlan,
	root: string,
	listed: string[],
	files: string[],
): Promise<ApplyMechanicalEditResult> {
	const planned = await planJavaImports({ root, files });
	if (!planned.ok || !planned.files) {
		return plan(
			classified,
			planned.reason ?? "java import rewrite was not proven",
		);
	}
	const listedSet = new Set(listed);
	const written: string[] = [];
	for (const [relativePath, text] of Object.entries(planned.files)) {
		const fileName = resolve(root, relativePath);
		if (!listedSet.has(fileName)) {
			return plan(classified, "java helper wrote an unlisted file");
		}
		await writeFile(fileName, text, "utf8");
		written.push(relativePath);
	}
	return {
		verdict: "mechanical",
		reason: "applied Java import-only rewrite",
		apply: "script",
		filesChanged: written.sort(),
	};
}

async function applyPythonFormat(
	classified: MechanicalEditPlan,
	payload: { files: string[] },
	root: string,
	listed: string[],
): Promise<ApplyMechanicalEditResult> {
	const ruff = repoRuff(root);
	if (!ruff) {
		return applyPythonEdit(
			classified,
			{ operation: "format-only", files: payload.files },
			root,
			listed,
			"applied Python format-only rewrite",
		);
	}
	const proposed: Record<string, string> = {};
	for (const file of listed) {
		const original = await Bun.file(file)
			.text()
			.catch(() => undefined);
		if (original === undefined) {
			return plan(classified, `missing file: ${relative(root, file) || file}`);
		}
		const next = await spawnStdin(
			[ruff, "format", "--stdin-filename", file, "-"],
			original,
		);
		if (next === undefined) {
			return plan(classified, "repo formatter failed");
		}
		proposed[relative(root, file).split(sep).join("/")] = next;
	}
	return applyPythonEdit(
		classified,
		{ operation: "assert-format", files: payload.files, proposed },
		root,
		listed,
		"applied Python format-only rewrite",
	);
}

async function applyJavaFormat(
	classified: MechanicalEditPlan,
	root: string,
	listed: string[],
	files: string[],
): Promise<ApplyMechanicalEditResult> {
	const formatter = repoJavaFormat(root);
	if (formatter) {
		const nextTexts = new Map<string, string>();
		for (const file of listed) {
			const original = await Bun.file(file)
				.text()
				.catch(() => undefined);
			if (original === undefined) {
				return plan(
					classified,
					`missing file: ${relative(root, file) || file}`,
				);
			}
			const next = await spawnStdin([formatter, "-"], original);
			if (next === undefined) {
				return plan(classified, "repo formatter failed");
			}
			try {
				if (!javaFormatIdentityHolds(original, next)) {
					return plan(
						classified,
						"format rewrite would change non-whitespace structure",
					);
				}
			} catch {
				return plan(classified, "java format rewrite was not proven");
			}
			if (next !== original) {
				nextTexts.set(file, next);
			}
		}
		return writeFormatResult(
			classified,
			root,
			nextTexts,
			"applied Java format-only rewrite",
		);
	}
	const planned = await planJavaFormat({ root, files });
	if (!planned.ok || !planned.files) {
		return plan(
			classified,
			planned.reason ?? "java format rewrite was not proven",
		);
	}
	const listedSet = new Set(listed);
	const written: string[] = [];
	for (const [relativePath, text] of Object.entries(planned.files)) {
		const fileName = resolve(root, relativePath);
		if (!listedSet.has(fileName)) {
			return plan(classified, "java helper wrote an unlisted file");
		}
		await writeFile(fileName, text, "utf8");
		written.push(relativePath);
	}
	return {
		verdict: "mechanical",
		reason: "applied Java format-only rewrite",
		apply: "script",
		filesChanged: written.sort(),
	};
}

function isImportStatement(statement: ts.Statement): boolean {
	return (
		ts.isImportDeclaration(statement) || ts.isImportEqualsDeclaration(statement)
	);
}

function nonImportText(source: string, fileName: string): string {
	const sourceFile = ts.createSourceFile(
		fileName,
		source,
		ts.ScriptTarget.Latest,
		true,
		ts.ScriptKind.TSX,
	);
	return sourceFile.statements
		.filter((statement) => !isImportStatement(statement))
		.map((statement) => statement.getText(sourceFile))
		.join("\n");
}

async function applyTypeScriptImports(
	classified: MechanicalEditPlan,
	root: string,
	listed: string[],
): Promise<ApplyMechanicalEditResult> {
	const config = compilerOptionsFromConfig(root);
	const programFiles = config.fileNames ?? (await listTypeScriptFiles(root));
	const fileNames = [...new Set([...programFiles, ...listed])];
	const service = createLanguageService(root, fileNames, config.options);
	const format: ts.FormatCodeSettings = {
		tabSize: 2,
		indentSize: 2,
		convertTabsToSpaces: true,
		newLineCharacter: "\n",
	};
	const listedSet = new Set(listed);
	const nextTexts = new Map<string, string>();
	for (const file of listed) {
		const original = ts.sys.readFile(file);
		if (original === undefined) {
			return plan(classified, `missing file: ${relative(root, file) || file}`);
		}
		const changes = service.organizeImports(
			{ type: "file", fileName: file, skipDestructiveCodeActions: false },
			format,
			{},
		);
		if (changes.some((change) => !listedSet.has(resolve(change.fileName)))) {
			return plan(
				classified,
				"import rewrite includes files that were not listed",
			);
		}
		const fileChanges = changes.filter(
			(change) => resolve(change.fileName) === file,
		);
		const edits: RenameEdit[] = [];
		for (const fileChange of fileChanges) {
			for (const textChange of fileChange.textChanges) {
				edits.push({
					fileName: file,
					start: textChange.span.start,
					end: textChange.span.start + textChange.span.length,
					text: textChange.newText,
				});
			}
		}
		if (edits.length === 0) {
			continue;
		}
		if (editsOverlap(edits)) {
			return plan(classified, "import edits overlap");
		}
		const next = applyEditsToText(original, edits);
		if (nonImportText(original, file) !== nonImportText(next, file)) {
			return plan(
				classified,
				"import rewrite would change code that is not an import",
			);
		}
		nextTexts.set(file, next);
	}
	const working = new Map<string, string>();
	for (const file of listed) {
		const original = ts.sys.readFile(file);
		if (original === undefined) {
			return plan(classified, `missing file: ${relative(root, file) || file}`);
		}
		working.set(file, nextTexts.get(file) ?? original);
	}
	const missing = await applyUniqueMissingImports(
		root,
		fileNames,
		config.options,
		listed,
		listedSet,
		format,
		working,
	);
	if (!missing.ok) {
		return plan(classified, missing.reason);
	}
	const written: string[] = [];
	for (const file of listed) {
		const original = ts.sys.readFile(file);
		const next = working.get(file);
		if (original === undefined || next === undefined || next === original) {
			continue;
		}
		await writeFile(file, next, "utf8");
		written.push(relative(root, file).split(sep).join("/"));
	}
	return {
		verdict: "mechanical",
		reason: "applied TypeScript import-only rewrite",
		apply: "script",
		filesChanged: written.sort(),
	};
}

function isMissingImportFix(fixName: string): boolean {
	return fixName === "import" || fixName === "fixMissingImport";
}

async function applyUniqueMissingImports(
	root: string,
	fileNames: string[],
	options: ts.CompilerOptions,
	listed: string[],
	listedSet: Set<string>,
	format: ts.FormatCodeSettings,
	working: Map<string, string>,
): Promise<{ ok: true } | { ok: false; reason: string }> {
	for (let step = 0; step < listed.length * 8; step += 1) {
		const service = createLanguageService(root, fileNames, options, working);
		let applied = false;
		for (const file of listed) {
			const original = working.get(file);
			if (original === undefined) {
				return {
					ok: false,
					reason: `missing file: ${relative(root, file) || file}`,
				};
			}
			for (const diagnostic of service.getSemanticDiagnostics(file)) {
				if (diagnostic.code !== 2304 || diagnostic.start === undefined) {
					continue;
				}
				const end = diagnostic.start + (diagnostic.length ?? 0);
				const fixes = service
					.getCodeFixesAtPosition(
						file,
						diagnostic.start,
						end,
						[diagnostic.code],
						format,
						{},
					)
					.filter((fix) => isMissingImportFix(fix.fixName));
				if (fixes.length !== 1 || !fixes[0]) {
					continue;
				}
				const changes = fixes[0].changes;
				if (
					changes.some((change) => !listedSet.has(resolve(change.fileName)))
				) {
					continue;
				}
				const edits: RenameEdit[] = [];
				for (const change of changes) {
					for (const textChange of change.textChanges) {
						edits.push({
							fileName: resolve(change.fileName),
							start: textChange.span.start,
							end: textChange.span.start + textChange.span.length,
							text: textChange.newText,
						});
					}
				}
				if (edits.length === 0 || editsOverlap(edits)) {
					continue;
				}
				const nextByFile = new Map(working);
				for (const [fileName, fileEdits] of groupEdits(edits)) {
					const current = nextByFile.get(fileName);
					if (current === undefined) {
						return {
							ok: false,
							reason: "import rewrite includes files that were not listed",
						};
					}
					const next = applyEditsToText(current, fileEdits);
					if (
						nonImportText(current, fileName) !== nonImportText(next, fileName)
					) {
						return {
							ok: false,
							reason: "import rewrite would change code that is not an import",
						};
					}
					nextByFile.set(fileName, next);
				}
				for (const [fileName, text] of nextByFile) {
					working.set(fileName, text);
				}
				applied = true;
				break;
			}
			if (applied) {
				break;
			}
		}
		if (!applied) {
			return { ok: true };
		}
	}
	return { ok: true };
}

function groupEdits(edits: RenameEdit[]): Map<string, RenameEdit[]> {
	const byFile = new Map<string, RenameEdit[]>();
	for (const edit of edits) {
		const list = byFile.get(edit.fileName) ?? [];
		list.push(edit);
		byFile.set(edit.fileName, list);
	}
	return byFile;
}

function astShape(source: string, fileName: string): string {
	const sourceFile = ts.createSourceFile(
		fileName,
		source,
		ts.ScriptTarget.Latest,
		true,
		ts.ScriptKind.TSX,
	);
	const walk = (node: ts.Node): unknown => {
		if (ts.isIdentifier(node)) {
			return ["id", node.text];
		}
		if (ts.isStringLiteral(node) || ts.isNumericLiteral(node)) {
			return ["lit", node.text];
		}
		const children: unknown[] = [];
		ts.forEachChild(node, (child) => {
			children.push(walk(child));
		});
		return [node.kind, children];
	};
	return JSON.stringify(walk(sourceFile));
}

async function spawnStdin(
	argv: string[],
	stdin: string,
): Promise<string | undefined> {
	const proc = Bun.spawn(argv, {
		stdin: "pipe",
		stdout: "pipe",
		stderr: "pipe",
	});
	proc.stdin.write(stdin);
	proc.stdin.end();
	const exit = await proc.exited;
	const stdout = await new Response(proc.stdout).text();
	if (exit !== 0) {
		return undefined;
	}
	return stdout;
}

function repoPrettier(root: string): string | undefined {
	const bin = join(root, "node_modules", ".bin", "prettier");
	return existsSync(bin) ? bin : undefined;
}

function repoRuff(root: string): string | undefined {
	for (const candidate of [
		join(root, ".venv", "bin", "ruff"),
		join(root, "venv", "bin", "ruff"),
	]) {
		if (existsSync(candidate)) {
			return candidate;
		}
	}
	return undefined;
}

function repoJavaFormat(root: string): string | undefined {
	const bin = join(root, "bin", "google-java-format");
	return existsSync(bin) ? bin : undefined;
}

async function writeFormatResult(
	classified: MechanicalEditPlan,
	root: string,
	nextTexts: Map<string, string>,
	reason: string,
): Promise<ApplyMechanicalEditResult> {
	const written: string[] = [];
	for (const [fileName, text] of nextTexts) {
		await writeFile(fileName, text, "utf8");
		written.push(relative(root, fileName).split(sep).join("/"));
	}
	return {
		verdict: "mechanical",
		reason,
		apply: "script",
		filesChanged: written.sort(),
	};
}

async function applyTypeScriptFormat(
	classified: MechanicalEditPlan,
	root: string,
	listed: string[],
): Promise<ApplyMechanicalEditResult> {
	const prettier = repoPrettier(root);
	if (prettier) {
		const nextTexts = new Map<string, string>();
		for (const file of listed) {
			const original = ts.sys.readFile(file);
			if (original === undefined) {
				return plan(
					classified,
					`missing file: ${relative(root, file) || file}`,
				);
			}
			const next = await spawnStdin(
				[prettier, "--stdin-filepath", file],
				original,
			);
			if (next === undefined) {
				return plan(classified, "repo formatter failed");
			}
			if (astShape(original, file) !== astShape(next, file)) {
				return plan(
					classified,
					"format rewrite would change non-whitespace structure",
				);
			}
			if (next !== original) {
				nextTexts.set(file, next);
			}
		}
		return writeFormatResult(
			classified,
			root,
			nextTexts,
			"applied TypeScript format-only rewrite",
		);
	}
	const config = compilerOptionsFromConfig(root);
	const programFiles = config.fileNames ?? (await listTypeScriptFiles(root));
	const fileNames = [...new Set([...programFiles, ...listed])];
	const service = createLanguageService(root, fileNames, config.options);
	const format: ts.FormatCodeSettings = {
		tabSize: 2,
		indentSize: 2,
		convertTabsToSpaces: true,
		newLineCharacter: "\n",
	};
	const nextTexts = new Map<string, string>();
	for (const file of listed) {
		const original = ts.sys.readFile(file);
		if (original === undefined) {
			return plan(classified, `missing file: ${relative(root, file) || file}`);
		}
		const textChanges = service.getFormattingEditsForDocument(file, format);
		const edits: RenameEdit[] = textChanges.map((textChange) => ({
			fileName: file,
			start: textChange.span.start,
			end: textChange.span.start + textChange.span.length,
			text: textChange.newText,
		}));
		if (edits.length === 0) {
			continue;
		}
		if (editsOverlap(edits)) {
			return plan(classified, "format edits overlap");
		}
		const next = applyEditsToText(original, edits);
		if (astShape(original, file) !== astShape(next, file)) {
			return plan(
				classified,
				"format rewrite would change non-whitespace structure",
			);
		}
		nextTexts.set(file, next);
	}
	return writeFormatResult(
		classified,
		root,
		nextTexts,
		"applied TypeScript format-only rewrite",
	);
}

export async function applyMechanicalEdit(input: {
	payload: unknown;
	root: string;
}): Promise<ApplyMechanicalEditResult> {
	const classified = classifyMechanicalEdit(input.payload);
	if (classified.verdict !== "mechanical") {
		return { ...classified, filesChanged: [] };
	}
	const payload = input.payload as {
		operation: string;
		from?: string;
		to?: string;
		files: string[];
	};
	const root = resolve(input.root);
	const listed = payload.files.map((file) => resolve(root, file));
	const languages = new Set(
		listed
			.map((file) => languageOf(file))
			.filter((language): language is ApplyLanguage => language !== undefined),
	);
	if (languages.size !== 1) {
		return plan(classified, "listed files are not one supported language");
	}
	const language = [...languages][0];
	if (!language) {
		return plan(classified, "listed files are not one supported language");
	}
	if (payload.operation === "import-only") {
		if (language === "python") {
			return applyPythonEdit(
				classified,
				payload,
				root,
				listed,
				"applied Python import-only rewrite",
			);
		}
		if (language === "java") {
			return applyJavaImports(classified, root, listed, payload.files);
		}
		if (language === "go") {
			return applyGoEdit(
				classified,
				payload,
				root,
				listed,
				"applied Go import-only rewrite",
			);
		}
		if (language === "csharp") {
			return applyCSharpPlan(
				classified,
				root,
				await planCSharpImports({ root, files: payload.files }),
				"applied C# import-only rewrite",
			);
		}
		if (language === "kotlin") {
			return applyKotlinPlan(
				classified,
				root,
				await planKotlinImports({ root, files: payload.files }),
				"applied Kotlin import-only rewrite",
			);
		}
		if (language !== "typescript") {
			return plan(classified, "no proven script for this operation");
		}
		return applyTypeScriptImports(classified, root, listed);
	}
	if (payload.operation === "format-only") {
		if (language === "python") {
			return applyPythonFormat(classified, payload, root, listed);
		}
		if (language === "java") {
			return applyJavaFormat(classified, root, listed, payload.files);
		}
		if (language === "go") {
			return applyGoEdit(
				classified,
				payload,
				root,
				listed,
				"applied Go format-only rewrite",
			);
		}
		if (language === "csharp") {
			return applyCSharpPlan(
				classified,
				root,
				await applyCSharpFormat({
					root,
					files: payload.files,
					run: spawnStdin,
				}),
				"applied C# format-only rewrite",
			);
		}
		if (language === "kotlin") {
			return applyKotlinPlan(
				classified,
				root,
				await applyKotlinFormat({
					root,
					files: payload.files,
					run: spawnStdin,
				}),
				"applied Kotlin format-only rewrite",
			);
		}
		if (language !== "typescript") {
			return plan(classified, "no proven script for this operation");
		}
		return applyTypeScriptFormat(classified, root, listed);
	}
	if (payload.operation !== "rename" || !payload.from || !payload.to) {
		return plan(classified, "no proven script for this operation");
	}
	if (language === "python") {
		return applyPythonEdit(
			classified,
			payload,
			root,
			listed,
			"applied Python identifier rename",
		);
	}
	if (language === "java") {
		return applyJavaRename(classified, payload, root, listed);
	}
	if (language === "go") {
		return applyGoEdit(
			classified,
			payload,
			root,
			listed,
			"applied Go identifier rename",
		);
	}
	if (language === "csharp") {
		return applyCSharpPlan(
			classified,
			root,
			await planCSharpRename({
				root,
				files: payload.files,
				from: payload.from,
				to: payload.to,
			}),
			"applied C# identifier rename",
		);
	}
	if (language === "kotlin") {
		return applyKotlinPlan(
			classified,
			root,
			await planKotlinRename({
				root,
				files: payload.files,
				from: payload.from,
				to: payload.to,
			}),
			"applied Kotlin identifier rename",
		);
	}
	if (language !== "typescript") {
		return plan(classified, "no proven script for this language");
	}

	const sources = new Map<string, string>();
	for (const file of listed) {
		const text = ts.sys.readFile(file);
		if (text === undefined) {
			return plan(classified, `missing file: ${relative(root, file) || file}`);
		}
		sources.set(file, text);
		if (hasIdentifier(text, payload.to)) {
			return plan(
				classified,
				`target identifier already exists: ${payload.to}`,
			);
		}
	}

	const config = compilerOptionsFromConfig(root);
	const programFiles = config.fileNames ?? (await listTypeScriptFiles(root));
	const fileNames = [...new Set([...programFiles, ...listed])];
	const service = createLanguageService(root, fileNames, config.options);
	const program = service.getProgram();
	if (!program) {
		return plan(classified, "TypeScript program could not be created");
	}
	const checker = program.getTypeChecker();
	const symbols = new Set<ts.Symbol>();
	let renameAt: { file: string; position: number } | undefined;
	for (const file of listed) {
		const sourceFile = program.getSourceFile(file);
		const text = sources.get(file);
		if (!sourceFile || text === undefined) {
			continue;
		}
		for (const position of identifierPositions(file, text, payload.from)) {
			const node = identifierAt(sourceFile, position);
			if (!node) {
				continue;
			}
			const symbol = originalSymbol(checker, node);
			if (!symbol) {
				continue;
			}
			symbols.add(symbol);
			renameAt ??= { file, position };
		}
	}
	if (!renameAt) {
		return plan(classified, "source identifier was not found");
	}
	if (symbols.size > 1) {
		return plan(classified, "source identifier is ambiguous");
	}

	const chosen = service.findRenameLocations(
		renameAt.file,
		renameAt.position,
		false,
		false,
		{ providePrefixAndSuffixTextForRename: true },
	);
	if (!chosen || chosen.length === 0) {
		return plan(classified, "source identifier was not found");
	}

	const listedSet = new Set(listed);
	const outside = chosen.filter(
		(location) => !listedSet.has(resolve(location.fileName)),
	);
	if (outside.length > 0) {
		return plan(classified, "rename graph includes files that were not listed");
	}

	const edits: RenameEdit[] = chosen.map((location) => ({
		fileName: resolve(location.fileName),
		start: location.textSpan.start,
		end: location.textSpan.start + location.textSpan.length,
		text: `${location.prefixText ?? ""}${payload.to}${location.suffixText ?? ""}`,
	}));
	if (editsOverlap(edits)) {
		return plan(classified, "rename edits overlap");
	}

	const byFile = new Map<string, RenameEdit[]>();
	for (const edit of edits) {
		const list = byFile.get(edit.fileName) ?? [];
		list.push(edit);
		byFile.set(edit.fileName, list);
	}

	const nextTexts = new Map<string, string>();
	for (const [fileName, fileEdits] of byFile) {
		const original = sources.get(fileName) ?? ts.sys.readFile(fileName);
		if (original === undefined) {
			return plan(classified, "rename target file disappeared");
		}
		nextTexts.set(fileName, applyEditsToText(original, fileEdits));
	}
	const written: string[] = [];
	for (const [fileName, text] of nextTexts) {
		await writeFile(fileName, text, "utf8");
		written.push(relative(root, fileName).split(sep).join("/"));
	}

	return {
		verdict: "mechanical",
		reason: "applied TypeScript identifier rename",
		apply: "script",
		filesChanged: written.sort(),
	};
}

if (import.meta.main) {
	const inputPath = process.argv[2];
	const root = process.argv[3];
	if (!inputPath || !root) {
		console.error("usage: apply-mechanical-edit <input.json> <repoRoot>");
		process.exit(2);
	}
	try {
		const result = await applyMechanicalEdit({
			payload: await Bun.file(inputPath).json(),
			root,
		});
		console.log(JSON.stringify(result));
	} catch (error) {
		console.error(error instanceof Error ? error.message : String(error));
		process.exit(2);
	}
}
