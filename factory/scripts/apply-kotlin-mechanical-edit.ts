import { existsSync } from "node:fs";
import { readdir, writeFile } from "node:fs/promises";
import { join, relative, resolve, sep } from "node:path";

const SKIP_DIRS = new Set([".git", "build", ".gradle", "node_modules"]);

interface Token {
	kind: "identifier" | "symbol" | "literal";
	text: string;
	start: number;
	end: number;
}

export interface KotlinPlan {
	ok: boolean;
	reason?: string;
	files?: Record<string, string>;
}

export function tokenizeKotlin(source: string): Token[] {
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
			if (end < 0) throw new Error("kotlin source has an unclosed comment");
			index = end + 2;
			continue;
		}
		if (source.startsWith('"""', index)) {
			const start = index;
			const end = source.indexOf('"""', index + 3);
			if (end < 0) throw new Error("kotlin source has an unclosed string");
			index = end + 3;
			tokens.push({
				kind: "literal",
				text: source.slice(start, index),
				start,
				end: index,
			});
			continue;
		}
		if (char === '"' || char === "'") {
			const start = index++;
			while (index < source.length) {
				if (source[index] === char) {
					index++;
					break;
				}
				if (source[index] === "\\") index++;
				index++;
			}
			if (source[index - 1] !== char) {
				throw new Error("kotlin source has an unclosed string");
			}
			tokens.push({
				kind: "literal",
				text: source.slice(start, index),
				start,
				end: index,
			});
			continue;
		}
		if (/[A-Za-z_]/.test(char)) {
			const start = index++;
			while (/[A-Za-z0-9_]/.test(source[index] ?? "")) index++;
			tokens.push({
				kind: "identifier",
				text: source.slice(start, index),
				start,
				end: index,
			});
			continue;
		}
		if (char === "`") {
			const start = index;
			const end = source.indexOf("`", index + 1);
			if (end < 0) throw new Error("kotlin source has an unclosed identifier");
			index = end + 1;
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
			} else if (entry.name.endsWith(".kt") || entry.name.endsWith(".kts")) {
				found.push(join(directory, entry.name));
			}
		}
	}
	await visit(root);
	return found.sort();
}

async function sources(root: string): Promise<Map<string, string>> {
	const found = new Map<string, string>();
	for (const file of await listFiles(root)) {
		found.set(file, await Bun.file(file).text());
	}
	return found;
}

function declarationCount(tokens: Token[], name: string): number {
	let count = 0;
	for (let index = 0; index < tokens.length; index++) {
		if (tokens[index]?.kind !== "identifier" || tokens[index]?.text !== name) {
			continue;
		}
		const previous = tokens[index - 1]?.text;
		if (
			[
				"class",
				"interface",
				"object",
				"typealias",
				"fun",
				"val",
				"var",
			].includes(previous ?? "")
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
	let next = source;
	for (const token of tokens
		.filter((item) => item.kind === "identifier" && item.text === from)
		.sort((a, b) => b.start - a.start)) {
		next = `${next.slice(0, token.start)}${to}${next.slice(token.end)}`;
	}
	return next;
}

export async function planKotlinRename(options: {
	root: string;
	files: string[];
	from: string;
	to: string;
}): Promise<KotlinPlan> {
	if (
		!/^[A-Za-z_][A-Za-z0-9_]*$/.test(options.from) ||
		!/^[A-Za-z_][A-Za-z0-9_]*$/.test(options.to) ||
		options.from === options.to
	) {
		return {
			ok: false,
			reason: "kotlin rename needs two different identifiers",
		};
	}
	const root = resolve(options.root);
	const listed = new Set(options.files.map((file) => resolve(root, file)));
	const all = await sources(root);
	let declarations = 0;
	for (const source of all.values()) {
		let tokens: Token[];
		try {
			tokens = tokenizeKotlin(source);
		} catch {
			return { ok: false, reason: "kotlin source was not proven" };
		}
		declarations += declarationCount(tokens, options.from);
		if (
			tokens.some(
				(token) => token.kind === "identifier" && token.text === options.to,
			)
		) {
			return { ok: false, reason: "kotlin rename target already exists" };
		}
		if (
			tokens.some(
				(token) =>
					token.kind === "literal" &&
					token.text.includes("$") &&
					token.text.includes(options.from),
			)
		) {
			return {
				ok: false,
				reason: "kotlin rename cannot prove a string template",
			};
		}
	}
	if (declarations !== 1) {
		return {
			ok: false,
			reason: "kotlin rename source is missing or ambiguous",
		};
	}
	const files: Record<string, string> = {};
	for (const [file, source] of all) {
		const tokens = tokenizeKotlin(source);
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
				reason: "kotlin rename has references in files that were not listed",
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

function packageName(source: string): string | undefined {
	return source.match(/^\s*package\s+([A-Za-z_][A-Za-z0-9_.]*)/m)?.[1];
}

function declaredTypes(tokens: Token[]): string[] {
	const values: string[] = [];
	for (let index = 0; index < tokens.length - 1; index++) {
		if (
			["class", "interface", "object", "typealias"].includes(
				tokens[index]?.text ?? "",
			) &&
			tokens[index + 1]?.kind === "identifier"
		) {
			values.push(tokens[index + 1]?.text ?? "");
		}
	}
	return values;
}

function importedNames(source: string): Set<string> {
	const values = new Set<string>();
	for (const match of source.matchAll(
		/^\s*import\s+([A-Za-z_][A-Za-z0-9_.]*)(?:\s+as\s+([A-Za-z_][A-Za-z0-9_]*))?/gm,
	)) {
		values.add(match[2] ?? match[1]?.split(".").at(-1) ?? "");
	}
	return values;
}

export async function planKotlinImports(options: {
	root: string;
	files: string[];
}): Promise<KotlinPlan> {
	const root = resolve(options.root);
	const all = await sources(root);
	const index = new Map<string, string[]>();
	for (const source of all.values()) {
		const tokens = tokenizeKotlin(source);
		const packageValue = packageName(source);
		if (!packageValue) continue;
		for (const type of declaredTypes(tokens)) {
			index.set(type, [...(index.get(type) ?? []), `${packageValue}.${type}`]);
		}
	}
	const files: Record<string, string> = {};
	for (const relativePath of options.files) {
		const source = all.get(resolve(root, relativePath));
		if (source === undefined) {
			return { ok: false, reason: `missing file: ${relativePath}` };
		}
		const tokens = tokenizeKotlin(source);
		const declared = new Set(declaredTypes(tokens));
		const imported = importedNames(source);
		const additions = new Set<string>();
		for (const token of tokens) {
			if (
				token.kind !== "identifier" ||
				!/^[A-Z]/.test(token.text) ||
				declared.has(token.text) ||
				imported.has(token.text)
			) {
				continue;
			}
			const candidates = [...new Set(index.get(token.text) ?? [])];
			if (candidates.length === 1) additions.add(candidates[0] ?? "");
		}
		if (additions.size === 0) continue;
		const packageMatch = source.match(/^\s*package[^\n]*\n/);
		const offset = packageMatch?.[0].length ?? 0;
		const block = [...additions]
			.sort()
			.map((path) => `import ${path}\n`)
			.join("");
		files[relativePath.split(sep).join("/")] =
			`${source.slice(0, offset)}\n${block}${source.slice(offset)}`;
	}
	return { ok: true, files };
}

export function kotlinIdentity(source: string): string {
	return tokenizeKotlin(source)
		.map((token) => `${token.kind}:${token.text}`)
		.join("\n");
}

export async function applyKotlinFormat(options: {
	root: string;
	files: string[];
	run: (command: string[], source: string) => Promise<string | undefined>;
}): Promise<KotlinPlan> {
	const root = resolve(options.root);
	const formatter = join(root, "bin", "ktfmt");
	if (!existsSync(formatter)) {
		return {
			ok: false,
			reason: "kotlin format-only needs repo-local bin/ktfmt",
		};
	}
	const files: Record<string, string> = {};
	for (const relativePath of options.files) {
		const source = await Bun.file(resolve(root, relativePath))
			.text()
			.catch(() => undefined);
		if (source === undefined) {
			return { ok: false, reason: `missing file: ${relativePath}` };
		}
		const next = await options.run(
			[formatter, "--stdin", relativePath],
			source,
		);
		if (next === undefined) {
			return { ok: false, reason: "repo formatter failed" };
		}
		try {
			if (kotlinIdentity(source) !== kotlinIdentity(next)) {
				return {
					ok: false,
					reason: "format rewrite would change non-whitespace structure",
				};
			}
		} catch {
			return { ok: false, reason: "kotlin format rewrite was not proven" };
		}
		if (next !== source) files[relativePath.split(sep).join("/")] = next;
	}
	return { ok: true, files };
}

export async function writeKotlinPlan(
	root: string,
	plan: KotlinPlan,
): Promise<string[]> {
	if (!plan.ok || !plan.files) return [];
	const written: string[] = [];
	for (const [relativePath, source] of Object.entries(plan.files)) {
		await writeFile(resolve(root, relativePath), source, "utf8");
		written.push(relativePath);
	}
	return written.sort();
}
