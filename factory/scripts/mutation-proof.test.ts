import { afterEach, expect, test } from "bun:test";
import {
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { classifyRoute } from "./classify-route";
import { proveMutation } from "./mutation-proof";
import { parseClassificationVerdict } from "./verdicts";

const dirs: string[] = [];
afterEach(() => {
	for (const dir of dirs.splice(0))
		rmSync(dir, { recursive: true, force: true });
});

function repo() {
	const root = mkdtempSync(join(tmpdir(), "mutation-proof-"));
	dirs.push(root);
	const git = (...args: string[]) => {
		const proc = Bun.spawnSync(["git", ...args], {
			cwd: root,
			stdout: "pipe",
			stderr: "pipe",
			env: {
				...process.env,
				GIT_AUTHOR_NAME: "t",
				GIT_AUTHOR_EMAIL: "t@example.invalid",
				GIT_COMMITTER_NAME: "t",
				GIT_COMMITTER_EMAIL: "t@example.invalid",
			},
		});
		if (proc.exitCode !== 0) throw new Error(proc.stderr.toString());
	};
	git("init", "--quiet", "-b", "main");
	git("config", "commit.gpgsign", "false");
	mkdirSync(join(root, "src"));
	mkdirSync(join(root, "tests"));
	writeFileSync(join(root, "src", "rule.txt"), "stop when nothing resolves\n");
	writeFileSync(join(root, "src", "other.txt"), "unrelated\n");
	writeFileSync(
		join(root, "tests", "rule.test.sh"),
		"grep -q 'stop when nothing resolves' src/rule.txt\n",
	);
	git("add", ".");
	git("commit", "--quiet", "-m", "init");
	return root;
}

const command = (root: string) => ({
	argv: [
		"bash",
		"-c",
		"if bash tests/rule.test.sh; then echo 'pass tests/rule.test.sh'; else echo 'FAIL tests/rule.test.sh: assertion failed'; exit 1; fi",
	],
	cwd: root,
	expectedTestPaths: ["tests/rule.test.sh"],
});

const breaking = `--- a/src/rule.txt
+++ b/src/rule.txt
@@ -1 +1 @@
-stop when nothing resolves
+carry on regardless
`;

test("a test that catches the broken behaviour is proven, and the source is restored", async () => {
	const root = repo();
	const proof = await proveMutation({
		repoRoot: root,
		command: command(root),
		patch: breaking,
	});
	expect(proof).toMatchObject({
		bites: true,
		mutatedFiles: ["src/rule.txt"],
		restored: true,
	});
	expect(readFileSync(join(root, "src", "rule.txt"), "utf8")).toBe(
		"stop when nothing resolves\n",
	);
});

test("a test that misses the break is reported as not biting", async () => {
	const root = repo();
	const elsewhere = `--- a/src/other.txt
+++ b/src/other.txt
@@ -1 +1 @@
-unrelated
+changed
`;
	const proof = await proveMutation({
		repoRoot: root,
		command: command(root),
		patch: elsewhere,
	});
	expect(proof.bites).toBe(false);
	expect(proof.reason).toMatch(/does not catch the mutation/);
	expect(readFileSync(join(root, "src", "other.txt"), "utf8")).toBe(
		"unrelated\n",
	);
});

test("a mutation of a test, an empty patch, a bad patch, or a dirty worktree is refused", async () => {
	const root = repo();
	const ofTest = `--- a/tests/rule.test.sh
+++ b/tests/rule.test.sh
@@ -1 +1 @@
-grep -q 'stop when nothing resolves' src/rule.txt
+true
`;
	await expect(
		proveMutation({ repoRoot: root, command: command(root), patch: ofTest }),
	).rejects.toThrow(/not a test/);
	await expect(
		proveMutation({ repoRoot: root, command: command(root), patch: " " }),
	).rejects.toThrow(/empty/);
	await expect(
		proveMutation({
			repoRoot: root,
			command: command(root),
			patch: breaking.replace("stop when", "halt if"),
		}),
	).rejects.toThrow(/does not apply/);
	writeFileSync(join(root, "src", "rule.txt"), "edited\n");
	await expect(
		proveMutation({ repoRoot: root, command: command(root), patch: breaking }),
	).rejects.toThrow(/clean/);
});

test("test-gap is an action class that names no assumption", () => {
	expect(classifyRoute("test-gap")).toBe("action");
	expect(
		parseClassificationVerdict(
			JSON.stringify([
				{
					commentId: "1",
					classification: "test-gap",
					reasoning: "behaviour is right at a.ts:3",
				},
			]),
		)[0]?.classification,
	).toBe("test-gap");
	expect(() =>
		parseClassificationVerdict(
			JSON.stringify([
				{
					commentId: "1",
					classification: "test-gap",
					reasoning: "r",
					assumption: "x",
				},
			]),
		),
	).toThrow(/only a bug/);
});
