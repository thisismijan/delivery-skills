import { describe, expect, test } from "bun:test";
import {
	checkNotePublication,
	type NotePublicationDeps,
} from "./note-publication";

const REPO = "/repo";
const REVIEW = "/repo/.review";
const CLEAN = "/repo/.review/mr-1/summary.md";

function deps(entries: Record<string, { real: string; content?: string }>): NotePublicationDeps {
	return {
		realpath: (path: string) => {
			const hit = entries[path];
			if (!hit) throw new Error(`realpath missing ${path}`);
			return hit.real;
		},
		readFile: (path: string) => {
			const hit = Object.values(entries).find((entry) => entry.real === path);
			if (!hit || hit.content === undefined) {
				throw new Error(`readFile missing ${path}`);
			}
			return hit.content;
		},
	};
}

const baseFs = {
	[REPO]: { real: REPO },
	[REVIEW]: { real: REVIEW },
	[CLEAN]: { real: CLEAN, content: "Holdout review passed." },
};

describe("checkNotePublication", () => {
	test("refuses a path that traverses out of the review directory", () => {
		const bodyPath = "/repo/.review/../secret.md";
		const result = checkNotePublication(
			{ bodyPath, repoRoot: REPO },
			deps({
				...baseFs,
				[bodyPath]: { real: "/repo/secret.md", content: "ok" },
			}),
		);
		expect(result.allowed).toBe(false);
		expect(result.reason).toMatch(/review/i);
	});

	test("refuses an absolute path outside the review directory", () => {
		const result = checkNotePublication(
			{ bodyPath: "/tmp/note.md", repoRoot: REPO },
			deps({
				...baseFs,
				"/tmp/note.md": { real: "/tmp/note.md", content: "ok" },
			}),
		);
		expect(result.allowed).toBe(false);
	});

	test("refuses a symlink that escapes the review directory", () => {
		const bodyPath = "/repo/.review/escape.md";
		const result = checkNotePublication(
			{ bodyPath, repoRoot: REPO },
			deps({
				...baseFs,
				[bodyPath]: { real: "/etc/passwd", content: "root:x" },
			}),
		);
		expect(result.allowed).toBe(false);
	});

	test.each([".env", "id_rsa", "id_rsa.pub", "credentials", "credentials.json", "tls.pem"])(
		"refuses secret-bearing name %s",
		(name) => {
			const bodyPath = `${REVIEW}/${name}`;
			const result = checkNotePublication(
				{ bodyPath, repoRoot: REPO, content: "plain note" },
				deps({
					...baseFs,
					[bodyPath]: { real: bodyPath, content: "plain note" },
				}),
			);
			expect(result.allowed).toBe(false);
			expect(result.reason).toMatch(/secret|sensitive|name/i);
		},
	);

	test.each([
		"token glpat-abcdefghijklmnopqrstuvwxyz",
		"Authorization: Bearer ghp_abcdefghijklmnopqrstuv",
		"sk-live-abcdefghijklmnopqrstuvwxyz",
		"-----BEGIN PRIVATE KEY-----\nMIIE",
		"-----BEGIN RSA PRIVATE KEY-----",
	])("refuses secret-like content", (content) => {
		const result = checkNotePublication(
			{ bodyPath: CLEAN, repoRoot: REPO, content },
			deps(baseFs),
		);
		expect(result.allowed).toBe(false);
		expect(result.reason).toMatch(/secret|content|token|key/i);
	});

	test("allows a body under the review directory with a safe name and clean content", () => {
		const result = checkNotePublication(
			{ bodyPath: CLEAN, repoRoot: REPO, content: "Holdout review passed." },
			deps(baseFs),
		);
		expect(result).toEqual({ allowed: true });
	});
});
