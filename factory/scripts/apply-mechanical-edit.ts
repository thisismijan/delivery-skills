import { readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve, sep } from "node:path";
import * as ts from "typescript";
import { z } from "zod";
import {
	type MechanicalEditPlan,
	classifyMechanicalEdit,
} from "./mechanical-edit";

const TYPESCRIPT_EXTENSIONS = new Set([".ts", ".tsx", ".mts", ".cts"]);
const PYTHON_EXTENSIONS = new Set([".py", ".pyi"]);
const JAVA_EXTENSIONS = new Set([".java"]);
const SKIP_DIRS = new Set(["node_modules", "dist", ".git"]);

type ApplyLanguage = "typescript" | "python" | "java";

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
): ts.LanguageService {
	const snapshots = new Map<string, ts.IScriptSnapshot>();
	const host: ts.LanguageServiceHost = {
		getCompilationSettings: () => options,
		getScriptFileNames: () => fileNames,
		getScriptVersion: () => "1",
		getScriptSnapshot: (fileName) => {
			const existing = snapshots.get(fileName);
			if (existing) {
				return existing;
			}
			const text = ts.sys.readFile(fileName);
			if (text === undefined) {
				return undefined;
			}
			const snapshot = ts.ScriptSnapshot.fromString(text);
			snapshots.set(fileName, snapshot);
			return snapshot;
		},
		getCurrentDirectory: () => root,
		getDefaultLibFileName: (opts) => ts.getDefaultLibFilePath(opts),
		fileExists: ts.sys.fileExists,
		readFile: ts.sys.readFile,
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

async function applyPythonRename(
	classified: MechanicalEditPlan,
	payload: { from?: string; to?: string; files: string[] },
	root: string,
	listed: string[],
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
			return plan(classified, "python rename helper failed");
		}
		const parsed = PythonRenameResult.safeParse(JSON.parse(stdout));
		if (!parsed.success || !parsed.data.ok || !parsed.data.files) {
			return plan(
				classified,
				parsed.success
					? (parsed.data.reason ?? "python rename was not proven")
					: "python rename helper returned invalid JSON",
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
			reason: "applied Python identifier rename",
			apply: "script",
			filesChanged: written.sort(),
		};
	} finally {
		await Bun.file(inputPath)
			.delete()
			.catch(() => undefined);
	}
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
	if (payload.operation !== "rename" || !payload.from || !payload.to) {
		return plan(classified, "no proven script for this operation");
	}

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
	if (language === "python") {
		return applyPythonRename(classified, payload, root, listed);
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
