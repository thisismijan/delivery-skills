import { readdir } from "node:fs/promises";
import { join, relative, resolve, sep } from "node:path";

const SKIP_DIRS = new Set(["node_modules", "dist", ".git", "target", "build"]);
const TYPE_KEYWORDS = new Set(["class", "interface", "enum", "record"]);
const TYPE_PRIMITIVES = new Set([
	"void",
	"boolean",
	"byte",
	"short",
	"int",
	"long",
	"char",
	"float",
	"double",
]);

export interface JavaRenamePlan {
	ok: boolean;
	reason?: string;
	files?: Record<string, string>;
	remove?: string[];
}

interface JavaToken {
	kind: "id" | "kw" | "type" | "dot";
	text: string;
	start: number;
	end: number;
}

function isIdentifierStart(char: string): boolean {
	return /[A-Za-z_$]/.test(char);
}

function isIdentifierPart(char: string): boolean {
	return /[A-Za-z0-9_$]/.test(char);
}

export function tokenizeJava(source: string): JavaToken[] {
	const tokens: JavaToken[] = [];
	let index = 0;
	while (index < source.length) {
		const char = source[index];
		if (!char) {
			break;
		}
		if (char === "/" && source[index + 1] === "/") {
			index = source.indexOf("\n", index);
			if (index < 0) {
				break;
			}
			continue;
		}
		if (char === "/" && source[index + 1] === "*") {
			const end = source.indexOf("*/", index + 2);
			index = end < 0 ? source.length : end + 2;
			continue;
		}
		if (char === '"' && source.slice(index, index + 3) === '"""') {
			const end = source.indexOf('"""', index + 3);
			index = end < 0 ? source.length : end + 3;
			continue;
		}
		if (char === '"' || char === "'") {
			index += 1;
			while (index < source.length) {
				if (source[index] === "\\") {
					index += 2;
					continue;
				}
				if (source[index] === char) {
					index += 1;
					break;
				}
				index += 1;
			}
			continue;
		}
		if (char === ".") {
			tokens.push({ kind: "dot", text: ".", start: index, end: index + 1 });
			index += 1;
			continue;
		}
		if (isIdentifierStart(char)) {
			let end = index + 1;
			while (end < source.length && isIdentifierPart(source[end] ?? "")) {
				end += 1;
			}
			const text = source.slice(index, end);
			const kind = TYPE_KEYWORDS.has(text)
				? "kw"
				: TYPE_PRIMITIVES.has(text)
					? "type"
					: "id";
			tokens.push({
				kind,
				text,
				start: index,
				end,
			});
			index = end;
			continue;
		}
		index += 1;
	}
	return tokens;
}

const JAVA_OPS = [
	">>>=",
	">>>",
	">>=",
	"<<=",
	"...",
	"::",
	"->",
	"++",
	"--",
	"==",
	"!=",
	"<=",
	">=",
	"&&",
	"||",
	"+=",
	"-=",
	"*=",
	"/=",
	"%=",
	"&=",
	"|=",
	"^=",
	"<<",
	">>",
	";",
	",",
	"(",
	")",
	"{",
	"}",
	"[",
	"]",
	".",
	"+",
	"-",
	"*",
	"/",
	"%",
	"&",
	"|",
	"^",
	"!",
	"~",
	"?",
	":",
	"=",
	"<",
	">",
	"@",
];
const NO_SPACE_AFTER = new Set(["(", "[", "{", ".", "@"]);
const NO_SPACE_BEFORE = new Set([")", "]", "}", ",", ";", ".", "..."]);
const ATTACHED_OPS = new Set(["++", "--", "!", "~"]);

export interface JavaFormatToken {
	kind: "id" | "number" | "string" | "comment" | "op" | "newline" | "indent";
	text: string;
}

function readJavaString(source: string, start: number): number {
	if (source.slice(start, start + 3) === '"""') {
		const end = source.indexOf('"""', start + 3);
		if (end < 0) {
			throw new Error("java format-only cannot prove an unclosed string");
		}
		return end + 3;
	}
	const quote = source[start];
	let index = start + 1;
	while (index < source.length) {
		if (source[index] === "\\") {
			index += 2;
			continue;
		}
		if (source[index] === quote) {
			return index + 1;
		}
		if (source[index] === "\n") {
			throw new Error("java format-only cannot prove an unclosed string");
		}
		index += 1;
	}
	throw new Error("java format-only cannot prove an unclosed string");
}

function readJavaNumber(source: string, start: number): number {
	let index = start;
	if (source[index] === "0" && /[xX]/.test(source[index + 1] ?? "")) {
		index += 2;
		while (/[0-9A-Fa-f_]/.test(source[index] ?? "")) {
			index += 1;
		}
	} else {
		while (/[0-9_]/.test(source[index] ?? "")) {
			index += 1;
		}
		if (source[index] === "." && /[0-9]/.test(source[index + 1] ?? "")) {
			index += 1;
			while (/[0-9_]/.test(source[index] ?? "")) {
				index += 1;
			}
		}
		if (/[eE]/.test(source[index] ?? "")) {
			index += 1;
			if (/[+-]/.test(source[index] ?? "")) {
				index += 1;
			}
			while (/[0-9_]/.test(source[index] ?? "")) {
				index += 1;
			}
		}
	}
	while (/[lLfFdD]/.test(source[index] ?? "")) {
		index += 1;
	}
	return index;
}

function readJavaOp(source: string, start: number): string | undefined {
	for (const op of JAVA_OPS) {
		if (source.startsWith(op, start)) {
			return op;
		}
	}
	return undefined;
}

export function tokenizeJavaFormat(source: string): JavaFormatToken[] {
	const tokens: JavaFormatToken[] = [];
	let index = 0;
	let atLineStart = true;
	while (index < source.length) {
		const char = source[index];
		if (!char) {
			break;
		}
		if (char === "\r") {
			index += source[index + 1] === "\n" ? 2 : 1;
			tokens.push({ kind: "newline", text: "\n" });
			atLineStart = true;
			continue;
		}
		if (char === "\n") {
			tokens.push({ kind: "newline", text: "\n" });
			index += 1;
			atLineStart = true;
			continue;
		}
		if (atLineStart && (char === " " || char === "\t")) {
			let end = index;
			let indent = "";
			while (end < source.length && (source[end] === " " || source[end] === "\t")) {
				indent += source[end] === "\t" ? "    " : " ";
				end += 1;
			}
			tokens.push({ kind: "indent", text: indent });
			index = end;
			atLineStart = false;
			continue;
		}
		atLineStart = false;
		if (char === " " || char === "\t") {
			index += 1;
			continue;
		}
		if (char === "/" && source[index + 1] === "/") {
			let end = source.indexOf("\n", index);
			if (end < 0) {
				end = source.length;
			}
			if (source[end - 1] === "\r") {
				end -= 1;
			}
			tokens.push({ kind: "comment", text: source.slice(index, end) });
			index = end;
			continue;
		}
		if (char === "/" && source[index + 1] === "*") {
			const end = source.indexOf("*/", index + 2);
			if (end < 0) {
				throw new Error("java format-only cannot prove an unclosed comment");
			}
			tokens.push({ kind: "comment", text: source.slice(index, end + 2) });
			index = end + 2;
			continue;
		}
		if (char === '"' || char === "'") {
			const end = readJavaString(source, index);
			tokens.push({ kind: "string", text: source.slice(index, end) });
			index = end;
			continue;
		}
		if (/[0-9]/.test(char)) {
			const end = readJavaNumber(source, index);
			tokens.push({ kind: "number", text: source.slice(index, end) });
			index = end;
			continue;
		}
		if (isIdentifierStart(char)) {
			let end = index + 1;
			while (end < source.length && isIdentifierPart(source[end] ?? "")) {
				end += 1;
			}
			tokens.push({ kind: "id", text: source.slice(index, end) });
			index = end;
			continue;
		}
		const op = readJavaOp(source, index);
		if (!op) {
			throw new Error("java format-only cannot prove this source");
		}
		tokens.push({ kind: "op", text: op });
		index += op.length;
	}
	return tokens;
}

function javaFormatShape(source: string): string {
	return JSON.stringify(
		tokenizeJavaFormat(source)
			.filter((token) => token.kind !== "indent")
			.map((token) => [token.kind, token.text]),
	);
}

function identifierShape(source: string): string {
	return JSON.stringify(tokenizeJava(source).map((token) => [token.kind, token.text]));
}

function needsSpace(previous: JavaFormatToken, next: JavaFormatToken): boolean {
	if (previous.kind === "newline" || previous.kind === "indent") {
		return false;
	}
	if (next.kind === "newline") {
		return false;
	}
	if (previous.kind === "comment" || next.kind === "comment") {
		return previous.kind !== "newline";
	}
	if (previous.kind === "op" && NO_SPACE_AFTER.has(previous.text)) {
		return false;
	}
	if (next.kind === "op" && NO_SPACE_BEFORE.has(next.text)) {
		return false;
	}
	if (previous.kind === "op" && ATTACHED_OPS.has(previous.text)) {
		return false;
	}
	if (next.kind === "op" && ATTACHED_OPS.has(next.text)) {
		return false;
	}
	return true;
}

export function javaFormatIdentityHolds(original: string, next: string): boolean {
	return (
		javaFormatShape(original) === javaFormatShape(next) &&
		identifierShape(original) === identifierShape(next)
	);
}

export function formatJavaSource(source: string): string {
	const tokens = tokenizeJavaFormat(source);
	let next = "";
	let previous: JavaFormatToken | undefined;
	for (const token of tokens) {
		if (token.kind === "newline") {
			next += "\n";
			previous = token;
			continue;
		}
		if (token.kind === "indent") {
			next += token.text;
			previous = token;
			continue;
		}
		if (previous && needsSpace(previous, token)) {
			next += " ";
		}
		next += token.text;
		previous = token;
	}
	if (javaFormatShape(source) !== javaFormatShape(next)) {
		throw new Error("format rewrite would change non-whitespace structure");
	}
	if (identifierShape(source) !== identifierShape(next)) {
		throw new Error("format rewrite would change non-whitespace structure");
	}
	return next;
}

export async function planJavaFormat(input: {
	root: string;
	files: string[];
}): Promise<JavaRenamePlan> {
	const root = resolve(input.root);
	const listed = input.files.map((file) => resolve(root, file));
	const rewritten: Record<string, string> = {};
	for (const file of listed) {
		const text = await Bun.file(file)
			.text()
			.catch(() => undefined);
		if (text === undefined) {
			return {
				ok: false,
				reason: `missing file: ${relative(root, file) || file}`,
			};
		}
		try {
			const next = formatJavaSource(text);
			if (next !== text) {
				rewritten[relative(root, file).split(sep).join("/")] = next;
			}
		} catch (error) {
			return {
				ok: false,
				reason:
					error instanceof Error
						? error.message
						: "java format rewrite was not proven",
			};
		}
	}
	return { ok: true, files: rewritten };
}

function typeDeclarationCount(tokens: JavaToken[], name: string): number {
	let count = 0;
	for (let index = 0; index < tokens.length; index += 1) {
		const token = tokens[index];
		const next = tokens[index + 1];
		if (
			token?.kind === "kw" &&
			TYPE_KEYWORDS.has(token.text) &&
			next?.text === name
		) {
			count += 1;
		}
	}
	return count;
}

function hasIdentifier(tokens: JavaToken[], name: string): boolean {
	return tokens.some((token) => token.kind === "id" && token.text === name);
}

function followedByParen(source: string, end: number): boolean {
	let index = end;
	while (index < source.length && /\s/.test(source[index] ?? "")) {
		index += 1;
	}
	return source[index] === "(";
}

function afterIdentifier(source: string, end: number): string {
	let index = skipSpaces(source, end);
	if (source.startsWith("[]", index)) {
		index = skipSpaces(source, index + 2);
	}
	return source[index] ?? "";
}

function fieldDeclarationCount(
	source: string,
	tokens: JavaToken[],
	name: string,
): number {
	let count = 0;
	for (let index = 0; index < tokens.length; index += 1) {
		const token = tokens[index];
		const previous = tokens[index - 1];
		if (
			token?.kind !== "id" ||
			token.text !== name ||
			!previous ||
			previous.kind === "dot" ||
			(previous.kind !== "id" && previous.kind !== "type")
		) {
			continue;
		}
		const next = afterIdentifier(source, token.end);
		if (next === "=" || next === ";") {
			count += 1;
		}
	}
	return count;
}

function methodDeclarationCount(
	source: string,
	tokens: JavaToken[],
	name: string,
): number {
	let count = 0;
	for (let index = 0; index < tokens.length; index += 1) {
		const token = tokens[index];
		const previous = tokens[index - 1];
		if (
			token?.kind === "id" &&
			token.text === name &&
			followedByParen(source, token.end) &&
			previous &&
			previous.kind !== "dot" &&
			(previous.kind === "id" || previous.kind === "type")
		) {
			count += 1;
		}
	}
	return count;
}

function rewrite(
	source: string,
	tokens: JavaToken[],
	from: string,
	to: string,
): string {
	let next = source;
	for (const token of [...tokens].reverse()) {
		if (token.kind === "id" && token.text === from) {
			next = `${next.slice(0, token.start)}${to}${next.slice(token.end)}`;
		}
	}
	return next;
}

function lineStart(source: string, index: number): number {
	let start = index;
	while (start > 0 && source[start - 1] !== "\n") {
		start -= 1;
	}
	return start;
}

function skipSpaces(source: string, index: number): number {
	let next = index;
	while (next < source.length && /\s/.test(source[next] ?? "")) {
		next += 1;
	}
	return next;
}

interface JavaImport {
	start: number;
	end: number;
	simple: string;
	star: boolean;
}

function javaImports(
	source: string,
	tokens: JavaToken[],
): { ok: true; imports: JavaImport[] } | { ok: false; reason: string } {
	const imports: JavaImport[] = [];
	for (let index = 0; index < tokens.length; index += 1) {
		const token = tokens[index];
		if (token?.text !== "import") {
			continue;
		}
		const prefix = source.slice(lineStart(source, token.start), token.start);
		if (/\S/.test(prefix)) {
			return { ok: false, reason: "java import-only cannot prove inline imports" };
		}
		let cursor = index + 1;
		if (tokens[cursor]?.text === "static") {
			cursor += 1;
		}
		const parts: string[] = [];
		let star = false;
		let lastEnd = token.end;
		while (cursor < tokens.length) {
			const current = tokens[cursor];
			if (
				current &&
				(current.kind === "id" || current.kind === "kw" || current.kind === "type")
			) {
				parts.push(current.text);
				lastEnd = current.end;
				cursor += 1;
				const dot = tokens[cursor];
				if (dot?.kind === "dot") {
					const afterDot = skipSpaces(source, dot.end);
					if (source[afterDot] === "*") {
						star = true;
						lastEnd = afterDot + 1;
						cursor += 1;
						break;
					}
					lastEnd = dot.end;
					cursor += 1;
					continue;
				}
				break;
			}
			break;
		}
		if (parts.length === 0) {
			return { ok: false, reason: "java import statement is incomplete" };
		}
		const semi = skipSpaces(source, lastEnd);
		if (source[semi] !== ";") {
			return { ok: false, reason: "java import-only cannot prove this import form" };
		}
		let end = semi + 1;
		const rest = source.slice(end, source.indexOf("\n", end) + 1 || source.length);
		if (rest.includes("\n")) {
			if (/\S/.test(rest.slice(0, rest.indexOf("\n")))) {
				return {
					ok: false,
					reason: "java import-only cannot prove inline imports",
				};
			}
			end = source.indexOf("\n", end) + 1;
		}
		const simple = parts[parts.length - 1];
		if (!simple) {
			return { ok: false, reason: "java import statement is incomplete" };
		}
		imports.push({
			start: lineStart(source, token.start),
			end,
			simple,
			star,
		});
	}
	return { ok: true, imports };
}

function dropJavaImports(source: string, unused: JavaImport[]): string {
	let next = source;
	for (const item of [...unused].sort((left, right) => right.start - left.start)) {
		next = `${next.slice(0, item.start)}${next.slice(item.end)}`;
	}
	return next;
}

function nonImportIdentifiers(tokens: JavaToken[], imports: JavaImport[]): Set<string> {
	const names = new Set<string>();
	for (const token of tokens) {
		if (token.kind !== "id") {
			continue;
		}
		if (
			imports.some((item) => token.start >= item.start && token.start < item.end)
		) {
			continue;
		}
		names.add(token.text);
	}
	return names;
}

export async function planJavaImports(input: {
	root: string;
	files: string[];
}): Promise<JavaRenamePlan> {
	const root = resolve(input.root);
	const listed = input.files.map((file) => resolve(root, file));
	const rewritten: Record<string, string> = {};
	for (const file of listed) {
		const text = await Bun.file(file)
			.text()
			.catch(() => undefined);
		if (text === undefined) {
			return {
				ok: false,
				reason: `missing file: ${relative(root, file) || file}`,
			};
		}
		const tokens = tokenizeJava(text);
		const parsed = javaImports(text, tokens);
		if (!parsed.ok) {
			return parsed;
		}
		if (parsed.imports.some((item) => item.star)) {
			return { ok: false, reason: "java import-only cannot prove star imports" };
		}
		const used = nonImportIdentifiers(tokens, parsed.imports);
		const unused = parsed.imports.filter((item) => !used.has(item.simple));
		if (unused.length === 0) {
			continue;
		}
		const next = dropJavaImports(text, unused);
		if (next === text) {
			continue;
		}
		const nextTokens = tokenizeJava(next);
		const nextParsed = javaImports(next, nextTokens);
		if (!nextParsed.ok) {
			return { ok: false, reason: "import rewrite would change code that is not an import" };
		}
		const before = nonImportIdentifiers(tokens, parsed.imports);
		const after = nonImportIdentifiers(nextTokens, nextParsed.imports);
		if (
			before.size !== after.size ||
			[...before].some((name) => !after.has(name))
		) {
			return { ok: false, reason: "import rewrite would change code that is not an import" };
		}
		rewritten[relative(root, file).split(sep).join("/")] = next;
	}
	return { ok: true, files: rewritten };
}

async function listJavaFiles(root: string): Promise<string[]> {
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
			if (entry.name.endsWith(".java")) {
				files.push(resolve(full));
			}
		}
	};
	await walk(root);
	return files;
}

export async function planJavaRename(input: {
	root: string;
	from: string;
	to: string;
	files: string[];
}): Promise<JavaRenamePlan> {
	const root = resolve(input.root);
	const listed = input.files.map((file) => resolve(root, file));
	const sources = new Map<string, { text: string; tokens: JavaToken[] }>();
	let declarations = 0;
	let methods = 0;
	let fields = 0;
	if (input.from === "serialVersionUID") {
		return { ok: false, reason: "java field rename cannot prove serialVersionUID" };
	}
	for (const file of listed) {
		const text = await Bun.file(file)
			.text()
			.catch(() => undefined);
		if (text === undefined) {
			return {
				ok: false,
				reason: `missing file: ${relative(root, file) || file}`,
			};
		}
		const tokens = tokenizeJava(text);
		declarations += typeDeclarationCount(tokens, input.from);
		methods += methodDeclarationCount(text, tokens, input.from);
		fields += fieldDeclarationCount(text, tokens, input.from);
		if (hasIdentifier(tokens, input.to)) {
			return {
				ok: false,
				reason: `target identifier already exists: ${input.to}`,
			};
		}
		sources.set(file, { text, tokens });
	}
	if (declarations > 1) {
		return { ok: false, reason: "source identifier is ambiguous" };
	}
	if (declarations === 0) {
		const kinds = [methods > 0 ? "method" : undefined, fields > 0 ? "field" : undefined]
			.filter((kind): kind is string => kind !== undefined);
		if (kinds.length !== 1) {
			return {
				ok: false,
				reason:
					kinds.length === 0
						? "no proven Java script for this identifier"
						: "source identifier is ambiguous",
			};
		}
		if (methods > 1 || fields > 1) {
			return { ok: false, reason: "source identifier is ambiguous" };
		}
	}

	const listedSet = new Set(listed);
	for (const file of await listJavaFiles(root)) {
		if (listedSet.has(file)) {
			continue;
		}
		const text = await Bun.file(file)
			.text()
			.catch(() => undefined);
		if (text === undefined) {
			continue;
		}
		if (hasIdentifier(tokenizeJava(text), input.from)) {
			return {
				ok: false,
				reason: "rename graph includes files that were not listed",
			};
		}
	}

	const rewritten: Record<string, string> = {};
	const remove: string[] = [];
	for (const [file, { text, tokens }] of sources) {
		const next = rewrite(text, tokens, input.from, input.to);
		const relativePath = relative(root, file).split(sep).join("/");
		const base = relativePath.slice(relativePath.lastIndexOf("/") + 1);
		const directory =
			relativePath.includes("/")
				? relativePath.slice(0, relativePath.lastIndexOf("/") + 1)
				: "";
		let destination = relativePath;
		if (declarations === 1 && base === `${input.from}.java`) {
			destination = `${directory}${input.to}.java`;
			const destinationFile = resolve(root, destination);
			const already = await Bun.file(destinationFile)
				.text()
				.catch(() => undefined);
			if (already !== undefined && destinationFile !== file) {
				return { ok: false, reason: "java type rename target file already exists" };
			}
			if (destination !== relativePath) {
				remove.push(relativePath);
			}
		}
		if (next !== text || destination !== relativePath) {
			rewritten[destination] = next !== text ? next : text;
		}
	}
	if (Object.keys(rewritten).length === 0) {
		return { ok: false, reason: "source identifier was not found" };
	}
	return { ok: true, files: rewritten, remove };
}
