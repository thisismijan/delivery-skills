import { existsSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { join, resolve, sep } from "node:path";

export interface PhpFormatPlan {
	ok: boolean;
	reason?: string;
	files?: Record<string, string>;
}

function phpTokens(source: string): string[] {
	if (source.includes("<<<")) {
		throw new Error("php heredoc and nowdoc are not proven");
	}
	const tokens: string[] = [];
	let index = 0;
	while (index < source.length) {
		const char = source[index] ?? "";
		const next = source[index + 1] ?? "";
		if (/\s/.test(char)) {
			index++;
			continue;
		}
		if ((char === "/" && next === "/") || char === "#") {
			if (char === "#" && next === "[") {
				tokens.push("#[");
				index += 2;
				continue;
			}
			const lineEnd = source.indexOf("\n", index);
			const close = source.indexOf("?>", index);
			index =
				close >= 0 && (lineEnd < 0 || close < lineEnd)
					? close
					: lineEnd < 0
						? source.length
						: lineEnd;
			continue;
		}
		if (char === "/" && next === "*") {
			const end = source.indexOf("*/", index + 2);
			if (end < 0) throw new Error("php source has an unclosed comment");
			index = end + 2;
			continue;
		}
		if (char === '"' || char === "'" || char === "`") {
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
				throw new Error("php source has an unclosed string");
			}
			tokens.push(source.slice(start, index));
			continue;
		}
		if (/[A-Za-z_\\$]/.test(char)) {
			const start = index++;
			while (/[A-Za-z0-9_\\]/.test(source[index] ?? "")) index++;
			tokens.push(source.slice(start, index));
			continue;
		}
		tokens.push(char);
		index++;
	}
	return tokens;
}

export function phpIdentity(source: string): string {
	return phpTokens(source).join("\n");
}

export async function planPhpFormat(options: {
	root: string;
	files: string[];
	run: (command: string[], source: string) => Promise<string | undefined>;
}): Promise<PhpFormatPlan> {
	const root = resolve(options.root);
	const formatter = join(root, "bin", "php-format");
	if (!existsSync(formatter)) {
		return {
			ok: false,
			reason: "php format-only needs repo-local bin/php-format",
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
		const next = await options.run([formatter, relativePath], source);
		if (next === undefined) {
			return { ok: false, reason: "repo formatter failed" };
		}
		try {
			if (phpIdentity(source) !== phpIdentity(next)) {
				return {
					ok: false,
					reason: "format rewrite would change non-whitespace structure",
				};
			}
		} catch {
			return { ok: false, reason: "php format rewrite was not proven" };
		}
		if (next !== source) {
			files[relativePath.split(sep).join("/")] = next;
		}
	}
	return { ok: true, files };
}

export async function writePhpFormat(
	root: string,
	plan: PhpFormatPlan,
): Promise<string[]> {
	if (!plan.ok || !plan.files) return [];
	const changed: string[] = [];
	for (const [relativePath, source] of Object.entries(plan.files)) {
		await writeFile(resolve(root, relativePath), source, "utf8");
		changed.push(relativePath);
	}
	return changed.sort();
}
