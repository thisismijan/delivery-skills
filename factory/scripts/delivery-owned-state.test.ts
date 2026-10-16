import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { auditComment } from "./audit";
import { META_FILENAME, parseChangeMeta } from "./change-meta";
import { groomOutputDir } from "./groom-paths";

const PACK_ROOT = join(import.meta.dir, "..", "..");

const LEGACY_TOKENS = [
	".ig-spec",
	"jiraKey",
	"opusJustification",
	"**ig-spec**",
	"ig-spec.json",
] as const;

const CORE_ROOTS = [
	"skills",
	"factory/scripts",
	"factory/agents",
	"factory/specs",
	"factory/RUNTIME.md",
	"factory/CONVENTIONS.md",
] as const;

const EXCLUDED_PREFIXES = [
	"adapters/",
	"openspec/",
	"providers/",
	"factory/scripts/generic-boundary.ts",
	"factory/scripts/generic-boundary.test.ts",
	"factory/scripts/delivery-owned-state.test.ts",
	"factory/scripts/migration-adapter.test.ts",
] as const;

function toPosix(path: string): string {
	return path.split(sep).join("/");
}

function isExcluded(rel: string): boolean {
	const posix = toPosix(rel);
	if (posix.endsWith(".test.ts") || posix.endsWith(".test.md")) return true;
	for (const prefix of EXCLUDED_PREFIXES) {
		if (posix === prefix || posix.startsWith(prefix)) return true;
	}
	return false;
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

function coreFiles(): string[] {
	const files: string[] = [];
	for (const root of CORE_ROOTS) {
		const full = join(PACK_ROOT, root);
		if (!existsSync(full)) continue;
		const stat = statSync(full);
		if (stat.isFile()) {
			files.push(full);
			continue;
		}
		walk(full, files);
	}
	return files
		.map((file) => toPosix(relative(PACK_ROOT, file)))
		.filter((rel) => !isExcluded(rel))
		.sort();
}

describe("delivery-owned runtime state names", () => {
	test("groom output, change metadata, and audit marker use delivery-owned names", () => {
		expect(groomOutputDir("Add export button")).toBe(
			".delivery/grooming/add-export-button/",
		);
		expect(META_FILENAME).toBe(".delivery.json");
		expect(
			auditComment("merged", "ready").startsWith("**delivery** · merged"),
		).toBe(true);
		const meta = parseChangeMeta(
			JSON.stringify({
				workItemKey: "SMAI-123",
				complexitySignal: "high",
				frontierJustification: "intricate locking",
			}),
		);
		expect(meta).toMatchObject({
			workItemKey: "SMAI-123",
			complexitySignal: "high",
			frontierJustification: "intricate locking",
		});
		expect(meta).not.toHaveProperty("jiraKey");
		expect(meta).not.toHaveProperty("opusJustification");
	});

	test("generic core does not teach source-framework state names", () => {
		const hits: string[] = [];
		for (const rel of coreFiles()) {
			const text = readFileSync(join(PACK_ROOT, rel), "utf8");
			for (const [index, line] of text.split(/\r?\n/).entries()) {
				for (const token of LEGACY_TOKENS) {
					if (!line.includes(token)) continue;
					hits.push(`${rel}:${index + 1}: ${line.trim().slice(0, 160)}`);
				}
			}
		}
		expect(hits).toEqual([]);
	});

	test("legacy reads live only in the optional migration adapter", () => {
		const adapter = join(PACK_ROOT, "adapters", "migration", "legacy-state.ts");
		expect(existsSync(adapter)).toBe(true);
		const text = readFileSync(adapter, "utf8");
		expect(text).toContain(".ig-spec/grooming");
		expect(text).toContain(".ig-spec.json");
		expect(text).toContain("jiraKey");
		expect(text).toContain("opusJustification");
		expect(text).toContain("**ig-spec** ·");
	});
});
