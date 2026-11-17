import { existsSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { join, resolve, sep } from "node:path";

export interface SwiftFormatPlan {
	ok: boolean;
	reason?: string;
	files?: Record<string, string>;
}

function readQuoted(source: string, start: number): number {
	const hashes = source.slice(start).match(/^#*/)?.[0] ?? "";
	let index = start + hashes.length;
	const multiline = source.startsWith('"""', index);
	const quote = multiline ? '"""' : '"';
	index += quote.length;
	const close = `${quote}${hashes}`;
	while (index < source.length) {
		if (source.startsWith(close, index)) {
			return index + close.length;
		}
		if (hashes.length === 0 && source[index] === "\\") index++;
		if (!multiline && source[index] === "\n") break;
		index++;
	}
	throw new Error("swift source has an unclosed string");
}

function swiftTokens(source: string): string[] {
	const tokens: string[] = [];
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
			let depth = 1;
			index += 2;
			while (index < source.length && depth > 0) {
				if (source.startsWith("/*", index)) {
					depth++;
					index += 2;
				} else if (source.startsWith("*/", index)) {
					depth--;
					index += 2;
				} else {
					index++;
				}
			}
			if (depth !== 0) throw new Error("swift source has an unclosed comment");
			continue;
		}
		if (char === '"' || /^#+"/.test(source.slice(index, index + 8))) {
			const end = readQuoted(source, index);
			tokens.push(source.slice(index, end));
			index = end;
			continue;
		}
		if (/[A-Za-z_]/.test(char)) {
			const start = index++;
			while (/[A-Za-z0-9_]/.test(source[index] ?? "")) index++;
			tokens.push(source.slice(start, index));
			continue;
		}
		if (char === "`") {
			const end = source.indexOf("`", index + 1);
			if (end < 0) throw new Error("swift source has an unclosed identifier");
			tokens.push(source.slice(index, end + 1));
			index = end + 1;
			continue;
		}
		tokens.push(char);
		index++;
	}
	return tokens;
}

export function swiftIdentity(source: string): string {
	return swiftTokens(source).join("\n");
}

export async function planSwiftFormat(options: {
	root: string;
	files: string[];
	run: (command: string[], source: string) => Promise<string | undefined>;
}): Promise<SwiftFormatPlan> {
	const root = resolve(options.root);
	const formatter = join(root, "bin", "swift-format");
	if (!existsSync(formatter)) {
		return {
			ok: false,
			reason: "swift format-only needs repo-local bin/swift-format",
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
			[formatter, "format", "--assume-filename", relativePath],
			source,
		);
		if (next === undefined) {
			return { ok: false, reason: "repo formatter failed" };
		}
		try {
			if (swiftIdentity(source) !== swiftIdentity(next)) {
				return {
					ok: false,
					reason: "format rewrite would change non-whitespace structure",
				};
			}
		} catch {
			return { ok: false, reason: "swift format rewrite was not proven" };
		}
		if (next !== source) {
			files[relativePath.split(sep).join("/")] = next;
		}
	}
	return { ok: true, files };
}

export async function writeSwiftFormat(
	root: string,
	plan: SwiftFormatPlan,
): Promise<string[]> {
	if (!plan.ok || !plan.files) return [];
	const changed: string[] = [];
	for (const [relativePath, source] of Object.entries(plan.files)) {
		await writeFile(resolve(root, relativePath), source, "utf8");
		changed.push(relativePath);
	}
	return changed.sort();
}
