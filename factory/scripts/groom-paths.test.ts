import { expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { assertGroomPath, groomOutputDir, slugify } from "./groom-paths";

// ---------------------------------------------------------------------------
// slugify — determinism and correctness
// ---------------------------------------------------------------------------

test("same title yields the same slug (determinism)", () => {
	const title = "Add export feature to dashboard";
	expect(slugify(title)).toBe(slugify(title));
});

test("calling slugify twice with the same title gives the same result", () => {
	const title = "Refactor the auth module";
	const first = slugify(title);
	const second = slugify(title);
	expect(first).toBe(second);
});

test("different titles yield different slugs", () => {
	const slugA = slugify("Add export button");
	const slugB = slugify("Remove import button");
	expect(slugA).not.toBe(slugB);
});

test("slug is lowercase", () => {
	const slug = slugify("Add EXPORT Feature");
	expect(slug).toBe(slug.toLowerCase());
});

test("slug uses hyphens not spaces", () => {
	const slug = slugify("add export feature");
	expect(slug).not.toContain(" ");
	expect(slug).toMatch(/^[a-z0-9-]+$/);
});

test("slug contains no forward-slash path separator", () => {
	const slug = slugify("some/path/like/title");
	expect(slug).not.toContain("/");
});

test("slug contains no backslash path separator", () => {
	const slug = slugify("some\\path\\like\\title");
	expect(slug).not.toContain("\\");
});

test("slug strips punctuation and special characters", () => {
	const slug = slugify("Hello, World! (v2.0)");
	// Should not contain comma, exclamation, parentheses, dots
	expect(slug).toMatch(/^[a-z0-9-]+$/);
});

test("slug for an empty title is stable (does not throw)", () => {
	expect(() => slugify("")).not.toThrow();
});

test("slugify a title with leading and trailing spaces works", () => {
	const trimmed = slugify("my feature");
	const padded = slugify("  my feature  ");
	expect(trimmed).toBe(padded);
});

// ---------------------------------------------------------------------------
// groomOutputDir — path shape
// ---------------------------------------------------------------------------

test("groomOutputDir returns a path under .ig-spec/grooming/<slug>/", () => {
	const dir = groomOutputDir("Add export button");
	const slug = slugify("Add export button");
	expect(dir).toBe(`.ig-spec/grooming/${slug}/`);
});

test("groomOutputDir starts with .ig-spec/grooming/", () => {
	const dir = groomOutputDir("Any Title Here");
	expect(dir.startsWith(".ig-spec/grooming/")).toBe(true);
});

test("groomOutputDir ends with a trailing slash", () => {
	const dir = groomOutputDir("Some title");
	expect(dir.endsWith("/")).toBe(true);
});

test("same title always yields the same output directory (determinism)", () => {
	const title = "Build the groom command";
	expect(groomOutputDir(title)).toBe(groomOutputDir(title));
});

test("different titles yield different output directories", () => {
	const dirA = groomOutputDir("Feature alpha");
	const dirB = groomOutputDir("Feature beta");
	expect(dirA).not.toBe(dirB);
});

test("groomOutputDir path contains the derived slug", () => {
	const title = "Build something cool";
	const slug = slugify(title);
	const dir = groomOutputDir(title);
	expect(dir).toContain(slug);
});

test("groomOutputDir path does not contain path-traversal sequences", () => {
	const dir = groomOutputDir("normal title");
	expect(dir).not.toContain("..");
});

test("assertGroomPath rejects traversal, absolute paths, and symlink escapes", async () => {
	const root = await mkdtemp(join(tmpdir(), "groom-paths-"));
	await mkdir(join(root, ".ig-spec", "grooming"), { recursive: true });
	await symlink(tmpdir(), join(root, ".ig-spec", "grooming", "escape"));
	try {
		await expect(assertGroomPath(root, "../outside.md")).rejects.toThrow();
		await expect(assertGroomPath(root, "/tmp/outside.md")).rejects.toThrow();
		await expect(
			assertGroomPath(root, ".ig-spec/grooming/escape/out.md"),
		).rejects.toThrow("symlink");
		await expect(
			assertGroomPath(root, ".ig-spec/grooming/safe/draft.md"),
		).resolves.toContain(".ig-spec/grooming/safe/draft.md");
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});
