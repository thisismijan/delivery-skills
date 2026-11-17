import { existsSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { join, resolve, sep } from "node:path";

export interface RustFormatPlan {
	ok: boolean;
	reason?: string;
	files?: Record<string, string>;
}

function rustTokens(source: string): string[] {
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
				if (source[index] === "/" && source[index + 1] === "*") {
					depth++;
					index += 2;
				} else if (source[index] === "*" && source[index + 1] === "/") {
					depth--;
					index += 2;
				} else {
					index++;
				}
			}
			if (depth !== 0) throw new Error("rust source has an unclosed comment");
			continue;
		}
		const raw = source.slice(index).match(/^(?:br|r)(#+)"/);
		if (raw) {
			const start = index;
			const close = `"${raw[1]}`;
			index += raw[0].length;
			const end = source.indexOf(close, index);
			if (end < 0) throw new Error("rust source has an unclosed raw string");
			index = end + close.length;
			tokens.push(source.slice(start, index));
			continue;
		}
		if (
			char === '"' ||
			(char === "b" && next === '"') ||
			(char === "c" && next === '"')
		) {
			const start = index;
			if (char !== '"') index++;
			index++;
			while (index < source.length) {
				if (source[index] === '"') {
					index++;
					break;
				}
				if (source[index] === "\\") index++;
				index++;
			}
			if (source[index - 1] !== '"') {
				throw new Error("rust source has an unclosed string");
			}
			tokens.push(source.slice(start, index));
			continue;
		}
		if (char === "'") {
			const charLiteral = source.slice(index).match(/^'(?:\\.|[^\\'])+'/);
			if (charLiteral) {
				tokens.push(charLiteral[0]);
				index += charLiteral[0].length;
				continue;
			}
		}
		if (/[A-Za-z_]/.test(char)) {
			const start = index++;
			while (/[A-Za-z0-9_]/.test(source[index] ?? "")) index++;
			tokens.push(source.slice(start, index));
			continue;
		}
		tokens.push(char);
		index++;
	}
	return tokens;
}

export function rustIdentity(source: string): string {
	return rustTokens(source).join("\n");
}

export async function planRustFormat(options: {
	root: string;
	files: string[];
	run: (command: string[], source: string) => Promise<string | undefined>;
}): Promise<RustFormatPlan> {
	const root = resolve(options.root);
	const formatter = join(root, "bin", "rustfmt");
	if (!existsSync(formatter)) {
		return {
			ok: false,
			reason: "rust format-only needs repo-local bin/rustfmt",
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
			[formatter, "--emit", "stdout", "--edition", "2021"],
			source,
		);
		if (next === undefined) {
			return { ok: false, reason: "repo formatter failed" };
		}
		try {
			if (rustIdentity(source) !== rustIdentity(next)) {
				return {
					ok: false,
					reason: "format rewrite would change non-whitespace structure",
				};
			}
		} catch {
			return { ok: false, reason: "rust format rewrite was not proven" };
		}
		if (next !== source) {
			files[relativePath.split(sep).join("/")] = next;
		}
	}
	return { ok: true, files };
}

export async function writeRustFormat(
	root: string,
	plan: RustFormatPlan,
): Promise<string[]> {
	if (!plan.ok || !plan.files) return [];
	const changed: string[] = [];
	for (const [relativePath, source] of Object.entries(plan.files)) {
		await writeFile(resolve(root, relativePath), source, "utf8");
		changed.push(relativePath);
	}
	return changed.sort();
}
