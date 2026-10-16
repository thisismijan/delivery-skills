import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

export const PACK_ROOT = join(import.meta.dir, "..", "..");

export const CORE_BOUNDARY_ROOTS = [
	"skills",
	"factory/agents",
	"factory/RUNTIME.md",
	"factory/CONVENTIONS.md",
] as const;

export const EXCLUDED_PREFIXES = ["adapters/", "openspec/"] as const;

export const PROVIDER_SPECIFIC_FILES = [
	"skills/mr-review/gl-mr",
	"skills/mr-review/gl-note",
	"skills/mr-review/cloud-setup.sh",
] as const;

export type ForbiddenCategory =
	| "source-framework"
	| "llm-vendor"
	| "agent-host"
	| "forge"
	| "tracker";

export type ForbiddenToken = {
	category: ForbiddenCategory;
	id: string;
	pattern: RegExp;
};

export const FORBIDDEN_TOKENS: readonly ForbiddenToken[] = [
	{
		category: "source-framework",
		id: "ig-spec",
		pattern: /ig-?spec/i,
	},
	{
		category: "agent-host",
		id: "claude",
		pattern: /\bclaude(?:\s+code)?\b/i,
	},
	{
		category: "agent-host",
		id: "cursor",
		pattern: /\bcursor\b/i,
	},
	{
		category: "llm-vendor",
		id: "anthropic",
		pattern: /\banthropic\b/i,
	},
	{
		category: "forge",
		id: "gitlab",
		pattern: /gitlab/i,
	},
	{
		category: "forge",
		id: "glab",
		pattern: /\bglab\b/i,
	},
	{
		category: "forge",
		id: "github",
		pattern: /\bgithub\b/i,
	},
	{
		category: "tracker",
		id: "jira",
		pattern: /\bjira\b/i,
	},
	{
		category: "tracker",
		id: "atlassian",
		pattern: /\batlassian\b/i,
	},
];

export type BoundaryHit = {
	path: string;
	line: number;
	category: ForbiddenCategory;
	id: string;
	excerpt: string;
};

const TEXT_EXTENSIONS = new Set([
	".md",
	".ts",
	".js",
	".json",
	".sh",
	".yml",
	".yaml",
	".txt",
	".toml",
]);

function toPosix(path: string): string {
	return path.split(sep).join("/");
}

export function isProviderSpecificFile(relativePath: string): boolean {
	return (PROVIDER_SPECIFIC_FILES as readonly string[]).includes(
		toPosix(relativePath),
	);
}

export function isForbiddenTokenFixture(relativePath: string): boolean {
	const posix = toPosix(relativePath);
	if (posix.includes("/fixtures/")) return true;
	if (/(^|\/)[^/]*forbidden[-.]tokens?[^/]*$/i.test(posix)) return true;
	return posix.endsWith(".test.ts") || posix.endsWith(".test.md");
}

export function isInGenericBoundary(relativePath: string): boolean {
	const posix = toPosix(relativePath).replace(/^\.\//, "");
	if (!posix) return false;
	for (const prefix of EXCLUDED_PREFIXES) {
		if (posix === prefix.slice(0, -1) || posix.startsWith(prefix)) {
			return false;
		}
	}
	if (isForbiddenTokenFixture(posix)) return false;
	if (isProviderSpecificFile(posix)) return false;
	if (posix === "factory/RUNTIME.md" || posix === "factory/CONVENTIONS.md") {
		return true;
	}
	if (posix.startsWith("factory/agents/")) return true;
	if (posix.startsWith("skills/")) return true;
	return false;
}

export function scanText(text: string, relativePath: string): BoundaryHit[] {
	const hits: BoundaryHit[] = [];
	const lines = text.split(/\r?\n/);
	for (const [index, line] of lines.entries()) {
		for (const token of FORBIDDEN_TOKENS) {
			if (!token.pattern.test(line)) continue;
			token.pattern.lastIndex = 0;
			hits.push({
				path: relativePath,
				line: index + 1,
				category: token.category,
				id: token.id,
				excerpt: line.trim().slice(0, 200),
			});
		}
	}
	return hits;
}

function hasTextExtension(path: string): boolean {
	const lower = path.toLowerCase();
	const dot = lower.lastIndexOf(".");
	if (dot < 0) return false;
	return TEXT_EXTENSIONS.has(lower.slice(dot));
}

function walk(dir: string, files: string[]): void {
	for (const entry of readdirSync(dir)) {
		if (entry === "node_modules" || entry === ".git") continue;
		const full = join(dir, entry);
		const stat = statSync(full);
		if (stat.isDirectory()) {
			walk(full, files);
			continue;
		}
		if (stat.isFile()) files.push(full);
	}
}

export function listGenericBoundaryFiles(root = PACK_ROOT): string[] {
	const files: string[] = [];
	for (const relRoot of CORE_BOUNDARY_ROOTS) {
		const full = join(root, relRoot);
		try {
			const stat = statSync(full);
			if (stat.isFile()) {
				files.push(full);
				continue;
			}
			if (stat.isDirectory()) walk(full, files);
		} catch {
			// Missing optional root is skipped.
		}
	}
	return files
		.map((file) => toPosix(relative(root, file)))
		.filter((rel) => isInGenericBoundary(rel) && hasTextExtension(rel))
		.sort();
}

export function scanGenericBoundary(root = PACK_ROOT): BoundaryHit[] {
	const hits: BoundaryHit[] = [];
	for (const rel of listGenericBoundaryFiles(root)) {
		const text = readFileSync(join(root, rel), "utf8");
		hits.push(...scanText(text, rel));
	}
	return hits;
}
