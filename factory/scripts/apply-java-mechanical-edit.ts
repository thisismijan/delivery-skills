import { readdir } from "node:fs/promises";
import { join, relative, resolve, sep } from "node:path";

const SKIP_DIRS = new Set(["node_modules", "dist", ".git", "target", "build"]);
const TYPE_KEYWORDS = new Set(["class", "interface", "enum", "record"]);

export interface JavaRenamePlan {
	ok: boolean;
	reason?: string;
	files?: Record<string, string>;
}

interface JavaToken {
	kind: "id" | "kw" | "other";
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
		if (isIdentifierStart(char)) {
			let end = index + 1;
			while (end < source.length && isIdentifierPart(source[end] ?? "")) {
				end += 1;
			}
			const text = source.slice(index, end);
			tokens.push({
				kind: TYPE_KEYWORDS.has(text) ? "kw" : "id",
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
		if (hasIdentifier(tokens, input.to)) {
			return {
				ok: false,
				reason: `target identifier already exists: ${input.to}`,
			};
		}
		sources.set(file, { text, tokens });
	}
	if (declarations === 0) {
		return {
			ok: false,
			reason: "no proven Java script for this identifier",
		};
	}
	if (declarations > 1) {
		return { ok: false, reason: "source identifier is ambiguous" };
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
	for (const [file, { text, tokens }] of sources) {
		const next = rewrite(text, tokens, input.from, input.to);
		if (next !== text) {
			rewritten[relative(root, file).split(sep).join("/")] = next;
		}
	}
	if (Object.keys(rewritten).length === 0) {
		return { ok: false, reason: "source identifier was not found" };
	}
	return { ok: true, files: rewritten };
}
