import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	GROOM_ROOT,
	assertGroomPath,
	groomOutputDir,
	slugify,
} from "./groom-paths";

const SAFE_SLUG = /^[a-z0-9-]+$/;

describe("slugify", () => {
	test("maps a title to lowercase words joined by hyphens", () => {
		expect(slugify("Show Order HISTORY")).toBe("show-order-history");
	});

	test("returns the same slug for the same title on every call", () => {
		const title = "Retry failed payments";
		const first = slugify(title);
		expect(slugify(title)).toBe(first);
		expect(slugify(title)).toBe(first);
	});

	test("gives different titles different slugs", () => {
		expect(slugify("Add refund button")).not.toBe(
			slugify("Remove refund button"),
		);
	});

	test("contains no upper-case letters", () => {
		const slug = slugify("CSV EXPORT For Admins");
		expect(slug).toBe(slug.toLowerCase());
	});

	test("turns spaces into hyphens", () => {
		const slug = slugify("nightly invoice archive");
		expect(slug).toBe("nightly-invoice-archive");
		expect(slug).not.toContain(" ");
	});

	test("removes punctuation", () => {
		const slug = slugify("Release notes, v3.1 (beta)!");
		expect(slug).toBe("release-notes-v3-1-beta");
		expect(slug).toMatch(SAFE_SLUG);
	});

	test("removes forward slashes", () => {
		expect(slugify("docs/guides/intro")).toBe("docs-guides-intro");
	});

	test("removes backslashes", () => {
		expect(slugify("docs\\guides\\intro")).toBe("docs-guides-intro");
	});

	test("ignores whitespace around the title", () => {
		expect(slugify("   refund flow \t")).toBe(slugify("refund flow"));
	});

	test("names a title with no letters or digits 'untitled' without throwing", () => {
		expect(slugify("")).toBe("untitled");
		expect(slugify(" ?! ")).toBe("untitled");
	});
});

describe("groomOutputDir", () => {
	const title = "Retry failed payments";

	test("is exactly the slug's directory under the grooming root", () => {
		expect(GROOM_ROOT).toBe(".delivery/grooming");
		expect(groomOutputDir(title)).toBe(`.delivery/grooming/${slugify(title)}/`);
	});

	test("starts with the grooming root", () => {
		expect(groomOutputDir(title).startsWith(".delivery/grooming/")).toBe(true);
	});

	test("ends with a slash", () => {
		expect(groomOutputDir(title).endsWith("/")).toBe(true);
	});

	test("includes the slug of the title", () => {
		expect(groomOutputDir(title)).toContain(slugify(title));
	});

	test("is the same for one title on every call", () => {
		expect(groomOutputDir("Refund flow")).toBe(groomOutputDir("Refund flow"));
	});

	test("differs between titles", () => {
		expect(groomOutputDir("Refund flow")).not.toBe(
			groomOutputDir("Invoice flow"),
		);
	});

	test("cannot be steered outside the root by the title", () => {
		const dir = groomOutputDir("../../outside");
		expect(dir).not.toContain("..");
		expect(dir).toBe(".delivery/grooming/outside/");
	});
});

describe("assertGroomPath", () => {
	let repo = "";

	beforeAll(async () => {
		repo = await mkdtemp(join(tmpdir(), "groom-paths-"));
		await mkdir(join(repo, ".delivery", "grooming", "real"), {
			recursive: true,
		});
		await symlink(tmpdir(), join(repo, ".delivery", "grooming", "linked"));
	});

	afterAll(async () => {
		await rm(repo, { recursive: true, force: true });
	});

	test("accepts a path under the root, including directories not made yet", async () => {
		expect(
			await assertGroomPath(repo, ".delivery/grooming/real/draft.md"),
		).toBe(join(repo, ".delivery/grooming/real/draft.md"));
		expect(
			await assertGroomPath(repo, ".delivery/grooming/new/deeper/draft.md"),
		).toBe(join(repo, ".delivery/grooming/new/deeper/draft.md"));
	});

	test("refuses a path that leaves the root or is the root itself", async () => {
		for (const candidate of [
			"../elsewhere.md",
			".delivery/notes.md",
			".delivery/grooming",
			".delivery/grooming/../grooming-copy/x.md",
			join(repo, ".delivery/grooming/real/draft.md"),
			"/tmp/elsewhere.md",
		]) {
			await expect(assertGroomPath(repo, candidate)).rejects.toThrow(
				"groom output must stay under .delivery/grooming",
			);
		}
	});

	test("refuses a path that passes through a symlinked directory", async () => {
		await expect(
			assertGroomPath(repo, ".delivery/grooming/linked/draft.md"),
		).rejects.toThrow("groom output path contains a symlink");
	});
});
