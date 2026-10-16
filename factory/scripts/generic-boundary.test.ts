import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	CORE_BOUNDARY_ROOTS,
	FORBIDDEN_TOKENS,
	PACK_ROOT,
	isInGenericBoundary,
	listGenericBoundaryFiles,
	scanGenericBoundary,
	scanText,
} from "./generic-boundary";

describe("generic boundary", () => {
	test("the documented roots are skills, factory prompts, and runtime docs", () => {
		expect([...CORE_BOUNDARY_ROOTS]).toEqual([
			"skills",
			"factory/agents",
			"factory/RUNTIME.md",
			"factory/CONVENTIONS.md",
		]);
	});

	test("includes core skills, prompts, and runtime docs", () => {
		expect(isInGenericBoundary("skills/delivery/SKILL.md")).toBe(true);
		expect(isInGenericBoundary("skills/groom/SKILL.md")).toBe(true);
		expect(isInGenericBoundary("factory/agents/implementer.md")).toBe(true);
		expect(isInGenericBoundary("factory/RUNTIME.md")).toBe(true);
		expect(isInGenericBoundary("factory/CONVENTIONS.md")).toBe(true);
		expect(isInGenericBoundary("skills/delivery/checks/capabilities.ts")).toBe(
			true,
		);
	});

	test("excludes adapters, archived OpenSpec history, detection fixtures, and provider data", () => {
		expect(isInGenericBoundary("adapters/cursor/README.md")).toBe(false);
		expect(isInGenericBoundary("adapters/claude-code/settings.json")).toBe(
			false,
		);
		expect(
			isInGenericBoundary("openspec/changes/archive/example/proposal.md"),
		).toBe(false);
		expect(
			isInGenericBoundary("openspec/changes/generic-delivery-core/design.md"),
		).toBe(false);
		expect(
			isInGenericBoundary("factory/scripts/generic-boundary.test.ts"),
		).toBe(false);
		expect(isInGenericBoundary("providers/openspec/README.md")).toBe(false);
		expect(
			isInGenericBoundary("skills/delivery/checks/delivery-specs.test.ts"),
		).toBe(false);
		expect(isInGenericBoundary("skills/fixtures/forbidden-tokens.md")).toBe(
			false,
		);
		expect(isInGenericBoundary("skills/mr-review/gl-mr")).toBe(false);
		expect(isInGenericBoundary("skills/mr-review/gl-note")).toBe(false);
		expect(isInGenericBoundary("skills/mr-review/cloud-setup.sh")).toBe(false);
		expect(isInGenericBoundary("providers/gitlab/gl-mr")).toBe(false);
		expect(isInGenericBoundary("providers/gitlab/gl-note")).toBe(false);
		expect(isInGenericBoundary("adapters/migration/legacy-state.ts")).toBe(
			false,
		);
		expect(isInGenericBoundary("README.md")).toBe(false);
		expect(isInGenericBoundary("install.sh")).toBe(false);
		expect(isInGenericBoundary("factory/scripts/stage-gating.ts")).toBe(false);
		expect(isInGenericBoundary("factory/model-catalogue.json")).toBe(false);
	});

	test("the token catalogue covers source framework, hosts, vendors, forge, and tracker", () => {
		const ids = FORBIDDEN_TOKENS.map((token) => token.id);
		expect(ids).toContain("ig-spec");
		expect(ids).toContain("claude");
		expect(ids).toContain("cursor");
		expect(ids).toContain("gitlab");
		expect(ids).toContain("jira");
		const categories = new Set(FORBIDDEN_TOKENS.map((token) => token.category));
		expect(categories).toEqual(
			new Set([
				"source-framework",
				"llm-vendor",
				"agent-host",
				"forge",
				"tracker",
			]),
		);
	});

	test("scanText reports every forbidden product class", () => {
		const hits = scanText(
			[
				"A thin conductor over ig-spec.",
				"This pack runs on Cursor and Claude Code.",
				"Reconnect Atlassian under Anthropic's console.",
				"GitLab via glab, or GitHub.",
				"Never transition Jira status.",
			].join("\n"),
			"skills/delivery/SKILL.md",
		);
		expect(hits.map((hit) => hit.id).sort()).toEqual([
			"anthropic",
			"atlassian",
			"claude",
			"cursor",
			"github",
			"gitlab",
			"glab",
			"ig-spec",
			"jira",
		]);
	});

	test("a planted host name in a fake pack is reported and adapters are skipped", () => {
		const root = mkdtempSync(join(tmpdir(), "generic-boundary-"));
		mkdirSync(join(root, "skills", "delivery"), { recursive: true });
		mkdirSync(join(root, "factory", "agents"), { recursive: true });
		mkdirSync(join(root, "adapters", "cursor"), { recursive: true });
		writeFileSync(
			join(root, "skills", "delivery", "SKILL.md"),
			"Use Cursor.\n",
		);
		writeFileSync(join(root, "factory", "RUNTIME.md"), "Factory runtime\n");
		writeFileSync(
			join(root, "factory", "CONVENTIONS.md"),
			"Delivery conventions\n",
		);
		writeFileSync(
			join(root, "adapters", "cursor", "README.md"),
			"Cursor host\n",
		);
		const hits = scanGenericBoundary(root);
		expect(hits.some((hit) => hit.path === "skills/delivery/SKILL.md")).toBe(
			true,
		);
		expect(hits.some((hit) => hit.path.startsWith("adapters/"))).toBe(false);
	});

	test("the live generic boundary lists the core files", () => {
		const files = listGenericBoundaryFiles(PACK_ROOT);
		expect(files).toContain("skills/delivery/SKILL.md");
		expect(files).toContain("factory/RUNTIME.md");
		expect(files).toContain("factory/CONVENTIONS.md");
		expect(files.some((file) => file.startsWith("factory/agents/"))).toBe(true);
		expect(files.some((file) => file.startsWith("adapters/"))).toBe(false);
		expect(files.some((file) => file.startsWith("openspec/"))).toBe(false);
	});

	test("generic core files contain no source-framework, host, vendor, forge, or tracker product names", () => {
		const hits = scanGenericBoundary(PACK_ROOT);
		expect(hits).toEqual([]);
	});

	test("unresolved conflict markers in a planted pack are reported", () => {
		const root = mkdtempSync(join(tmpdir(), "generic-conflict-"));
		mkdirSync(join(root, "skills", "delivery"), { recursive: true });
		mkdirSync(join(root, "factory", "agents"), { recursive: true });
		writeFileSync(
			join(root, "skills", "delivery", "SKILL.md"),
			["<<<<<<< HEAD", "ours", "=======", "theirs", ">>>>>>> other"].join(
				"\n",
			) + "\n",
		);
		writeFileSync(join(root, "factory", "RUNTIME.md"), "Factory runtime\n");
		writeFileSync(
			join(root, "factory", "CONVENTIONS.md"),
			"Delivery conventions\n",
		);
		const hits = scanGenericBoundary(root);
		expect(
			hits.some(
				(hit) =>
					hit.id === "conflict-marker" ||
					hit.excerpt.includes("<<<<<<<") ||
					hit.excerpt.includes(">>>>>>>"),
			),
		).toBe(true);
	});

	test("the live generic boundary contains no unresolved conflict markers", () => {
		const hits = scanGenericBoundary(PACK_ROOT).filter(
			(hit) => hit.id === "conflict-marker",
		);
		expect(hits).toEqual([]);
	});
});
