import { existsSync } from "node:fs";
import { readdir, writeFile } from "node:fs/promises";
import { basename, join, relative, resolve, sep } from "node:path";

const SKIP_DIRS = new Set([".git", "bin", "obj", "node_modules"]);

interface Token {
	kind: "identifier" | "symbol" | "literal";
	text: string;
	start: number;
	end: number;
}

export interface CSharpPlan {
	ok: boolean;
	reason?: string;
	files?: Record<string, string>;
}

function identifierStart(char: string): boolean {
	return /[A-Za-z_]/.test(char);
}

function identifierPart(char: string): boolean {
	return /[A-Za-z0-9_]/.test(char);
}

export function tokenizeCSharp(source: string): Token[] {
	const tokens: Token[] = [];
	let index = 0;
	while (index < source.length) {
		const char = source[index] ?? "";
		const next = source[index + 1] ?? "";
		if (/\s/.test(char)) {
			index++;
			continue;
		}
		if (char === "/" && next === "/") {
			index = source.indexOf("\n", index + 2);
			if (index < 0) break;
			continue;
		}
		if (char === "/" && next === "*") {
			const end = source.indexOf("*/", index + 2);
			if (end < 0) throw new Error("csharp source has an unclosed comment");
			index = end + 2;
			continue;
		}
		const stringPrefix =
			char === '"' ||
			char === "'" ||
			(char === "@" && next === '"') ||
			((char === "$" || char === "@") &&
				(next === '"' || (next === "$" && source[index + 2] === '"')));
		if (stringPrefix) {
			const start = index;
			const quote = char === "'" ? "'" : '"';
			const verbatim = source.slice(index, index + 3).includes("@");
			index = source.indexOf(quote, index) + 1;
			if (index === 0) throw new Error("csharp source has an unclosed string");
			while (index < source.length) {
				if (source[index] === quote) {
					if (verbatim && source[index + 1] === quote) {
						index += 2;
						continue;
					}
					index++;
					break;
				}
				if (!verbatim && source[index] === "\\") index++;
				index++;
			}
			if (source[index - 1] !== quote) {
				throw new Error("csharp source has an unclosed string");
			}
			tokens.push({
				kind: "literal",
				text: source.slice(start, index),
				start,
				end: index,
			});
			continue;
		}
		if (identifierStart(char)) {
			const start = index++;
			while (index < source.length && identifierPart(source[index] ?? "")) {
				index++;
			}
			tokens.push({
				kind: "identifier",
				text: source.slice(start, index),
				start,
				end: index,
			});
			continue;
		}
		tokens.push({
			kind: "symbol",
			text: char,
			start: index,
			end: index + 1,
		});
		index++;
	}
	return tokens;
}

async function listFiles(root: string): Promise<string[]> {
	const found: string[] = [];
	async function visit(directory: string): Promise<void> {
		for (const entry of await readdir(directory, { withFileTypes: true })) {
			if (entry.isDirectory()) {
				if (!SKIP_DIRS.has(entry.name))
					await visit(join(directory, entry.name));
			} else if (entry.name.endsWith(".cs")) {
				found.push(join(directory, entry.name));
			}
		}
	}
	await visit(root);
	return found.sort();
}

async function readSources(root: string): Promise<Map<string, string>> {
	const sources = new Map<string, string>();
	for (const file of await listFiles(root)) {
		sources.set(file, await Bun.file(file).text());
	}
	return sources;
}

function declarationCount(tokens: Token[], name: string): number {
	const typeKeywords = new Set([
		"class",
		"struct",
		"interface",
		"record",
		"enum",
	]);
	let count = 0;
	for (let index = 0; index < tokens.length; index++) {
		const token = tokens[index];
		if (token?.kind !== "identifier" || token.text !== name) continue;
		const previous = tokens[index - 1];
		const next = tokens[index + 1];
		if (previous && typeKeywords.has(previous.text)) {
			count++;
			continue;
		}
		if (
			previous?.kind === "identifier" &&
			previous.text !== "return" &&
			previous.text !== "new" &&
			tokens[index - 2]?.text !== "." &&
			["(", ";", "=", ",", "{", ")", "=>"].includes(next?.text ?? "")
		) {
			count++;
		}
	}
	return count;
}

function rewrite(
	source: string,
	tokens: Token[],
	from: string,
	to: string,
): string {
	const edits = tokens
		.filter((token) => token.kind === "identifier" && token.text === from)
		.sort((a, b) => b.start - a.start);
	let next = source;
	for (const edit of edits) {
		next = `${next.slice(0, edit.start)}${to}${next.slice(edit.end)}`;
	}
	return next;
}

export async function planCSharpRename(options: {
	root: string;
	files: string[];
	from: string;
	to: string;
}): Promise<CSharpPlan> {
	if (
		!/^[A-Za-z_][A-Za-z0-9_]*$/.test(options.from) ||
		!/^[A-Za-z_][A-Za-z0-9_]*$/.test(options.to) ||
		options.from === options.to
	) {
		return {
			ok: false,
			reason: "csharp rename needs two different identifiers",
		};
	}
	const root = resolve(options.root);
	const listed = new Set(options.files.map((file) => resolve(root, file)));
	const sources = await readSources(root);
	let declarations = 0;
	for (const source of sources.values()) {
		let tokens: Token[];
		try {
			tokens = tokenizeCSharp(source);
		} catch {
			return { ok: false, reason: "csharp source was not proven" };
		}
		declarations += declarationCount(tokens, options.from);
		if (
			tokens.some(
				(token) => token.kind === "identifier" && token.text === options.to,
			)
		) {
			return { ok: false, reason: "csharp rename target already exists" };
		}
		if (
			tokens.some(
				(token) =>
					token.kind === "literal" &&
					token.text.startsWith("$") &&
					token.text.includes(options.from),
			)
		) {
			return {
				ok: false,
				reason: "csharp rename cannot prove an interpolated string",
			};
		}
	}
	if (declarations !== 1) {
		return {
			ok: false,
			reason: "csharp rename source is missing or ambiguous",
		};
	}
	const files: Record<string, string> = {};
	for (const [file, source] of sources) {
		const tokens = tokenizeCSharp(source);
		if (
			!tokens.some(
				(token) => token.kind === "identifier" && token.text === options.from,
			)
		) {
			continue;
		}
		if (!listed.has(file)) {
			return {
				ok: false,
				reason: "csharp rename has references in files that were not listed",
			};
		}
		files[relative(root, file).split(sep).join("/")] = rewrite(
			source,
			tokens,
			options.from,
			options.to,
		);
	}
	return { ok: true, files };
}

function namespaceOf(tokens: Token[]): string | undefined {
	const at = tokens.findIndex((token) => token.text === "namespace");
	if (at < 0) return undefined;
	const parts: string[] = [];
	for (let index = at + 1; index < tokens.length; index++) {
		const text = tokens[index]?.text;
		if (text === ";" || text === "{") break;
		if (text !== ".") parts.push(text ?? "");
	}
	return parts.length > 0 ? parts.join(".") : undefined;
}

function publicTypes(tokens: Token[]): string[] {
	const values: string[] = [];
	for (let index = 0; index < tokens.length - 1; index++) {
		if (
			["class", "struct", "interface", "record", "enum"].includes(
				tokens[index]?.text ?? "",
			) &&
			tokens[index + 1]?.kind === "identifier"
		) {
			values.push(tokens[index + 1]?.text ?? "");
		}
	}
	return values;
}

function usingNamespaces(tokens: Token[]): Set<string> {
	const values = new Set<string>();
	for (let index = 0; index < tokens.length; index++) {
		if (tokens[index]?.text !== "using") continue;
		const parts: string[] = [];
		for (let cursor = index + 1; cursor < tokens.length; cursor++) {
			const text = tokens[cursor]?.text;
			if (text === ";") break;
			if (text === "=" || text === "(") {
				parts.length = 0;
				break;
			}
			if (text !== ".") parts.push(text ?? "");
		}
		if (parts.length > 0) values.add(parts.join("."));
	}
	return values;
}

export async function planCSharpImports(options: {
	root: string;
	files: string[];
}): Promise<CSharpPlan> {
	const root = resolve(options.root);
	const sources = await readSources(root);
	const index = new Map<string, string[]>();
	for (const source of sources.values()) {
		const tokens = tokenizeCSharp(source);
		const namespace = namespaceOf(tokens);
		if (!namespace) continue;
		for (const type of publicTypes(tokens)) {
			index.set(type, [...(index.get(type) ?? []), namespace]);
		}
	}
	const files: Record<string, string> = {};
	for (const relativePath of options.files) {
		const file = resolve(root, relativePath);
		const source = sources.get(file);
		if (source === undefined) {
			return { ok: false, reason: `missing file: ${relativePath}` };
		}
		const tokens = tokenizeCSharp(source);
		const declared = new Set(publicTypes(tokens));
		const imported = usingNamespaces(tokens);
		const additions = new Set<string>();
		for (const token of tokens) {
			if (
				token.kind !== "identifier" ||
				!/^[A-Z]/.test(token.text) ||
				declared.has(token.text)
			) {
				continue;
			}
			const namespaces = [...new Set(index.get(token.text) ?? [])];
			if (namespaces.length === 1 && !imported.has(namespaces[0] ?? "")) {
				additions.add(namespaces[0] ?? "");
			}
		}
		if (additions.size === 0) continue;
		const prefix = [...additions]
			.sort()
			.map((namespace) => `using ${namespace};\n`)
			.join("");
		files[relativePath.split(sep).join("/")] = `${prefix}${source}`;
	}
	return { ok: true, files };
}

export function csharpIdentity(source: string): string {
	return tokenizeCSharp(source)
		.map((token) => `${token.kind}:${token.text}`)
		.join("\n");
}

export async function applyCSharpFormat(options: {
	root: string;
	files: string[];
	run: (command: string[], source: string) => Promise<string | undefined>;
}): Promise<CSharpPlan> {
	const root = resolve(options.root);
	const formatter = join(root, "bin", "csharpier");
	if (!existsSync(formatter)) {
		return {
			ok: false,
			reason: "csharp format-only needs repo-local bin/csharpier",
		};
	}
	const files: Record<string, string> = {};
	for (const relativePath of options.files) {
		const file = resolve(root, relativePath);
		const source = await Bun.file(file)
			.text()
			.catch(() => undefined);
		if (source === undefined) {
			return { ok: false, reason: `missing file: ${relativePath}` };
		}
		const next = await options.run([formatter, "--stdin", file], source);
		if (next === undefined) {
			return { ok: false, reason: "repo formatter failed" };
		}
		try {
			if (csharpIdentity(source) !== csharpIdentity(next)) {
				return {
					ok: false,
					reason: "format rewrite would change non-whitespace structure",
				};
			}
		} catch {
			return { ok: false, reason: "csharp format rewrite was not proven" };
		}
		if (next !== source) {
			files[relativePath.split(sep).join("/")] = next;
		}
	}
	return { ok: true, files };
}

export async function writeCSharpPlan(
	root: string,
	plan: CSharpPlan,
): Promise<string[]> {
	if (!plan.ok || !plan.files) return [];
	const written: string[] = [];
	for (const [relativePath, source] of Object.entries(plan.files)) {
		await writeFile(resolve(root, relativePath), source, "utf8");
		written.push(relativePath);
	}
	return written.sort();
}
