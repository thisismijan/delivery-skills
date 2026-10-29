import {
	copyFileSync,
	existsSync,
	lstatSync,
	mkdirSync,
	readFileSync,
	realpathSync,
	writeFileSync,
} from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { z } from "zod";

// biome-ignore format: the workflow contract reads each invocation as one double-quoted literal
export const WORKTREE_FILES_PROPOSE_INVOCATION =
	"scripts/worktree-files.ts propose <repoRoot>";
// biome-ignore format: the workflow contract reads each invocation as one double-quoted literal
export const WORKTREE_FILES_CONFIRM_INVOCATION =
	"scripts/worktree-files.ts confirm <repoRoot> <worktree-files.json>";
// biome-ignore format: the workflow contract reads each invocation as one double-quoted literal
export const WORKTREE_FILES_COPY_INVOCATION =
	"scripts/worktree-files.ts copy <repoRoot> <worktree-path>";

export const WORKTREE_FILES_PATH = ".delivery/worktree-files.json";
export const MAX_WORKTREE_FILE_BYTES = 1024 * 1024;
export const MAX_WORKTREE_FILES = 50;

const FilePath = z
	.string()
	.trim()
	.min(1)
	.refine((path) => !isAbsolute(path), "must be relative to the repository")
	.refine(
		(path) => !path.split(/[\\/]/).some((part) => part === ".." || part === ""),
		"must not climb out of the repository or contain empty segments",
	)
	.refine(
		(path) => !/[*?[\]{}]/.test(path),
		"must be an exact path, not a pattern",
	)
	.refine(
		(path) => !path.startsWith(".git/") && path !== ".git",
		"must not be inside .git",
	);

export const WorktreeFiles = z
	.object({
		version: z.literal(1),
		files: z.array(FilePath).max(MAX_WORKTREE_FILES),
		approval: z
			.object({
				who: z.string().trim().min(1),
				words: z.string().trim().min(1),
				at: z.string().datetime(),
			})
			.strict(),
	})
	.strict()
	.superRefine((config, ctx) => {
		if (new Set(config.files).size !== config.files.length) {
			ctx.addIssue({
				code: "custom",
				path: ["files"],
				message: "each file is listed once",
			});
		}
	});
export type WorktreeFiles = z.infer<typeof WorktreeFiles>;

function git(cwd: string, args: string[]): { code: number; stdout: string } {
	const proc = Bun.spawnSync(["git", ...args], {
		cwd,
		stdout: "pipe",
		stderr: "pipe",
	});
	return { code: proc.exitCode ?? 1, stdout: proc.stdout.toString() };
}

function inside(root: string, path: string): boolean {
	const rel = relative(root, path);
	return (
		rel !== "" &&
		!rel.startsWith(`..${sep}`) &&
		rel !== ".." &&
		!isAbsolute(rel)
	);
}

export function checkSource(
	repoRoot: string,
	path: string,
): string | undefined {
	const parsed = FilePath.safeParse(path);
	if (!parsed.success) {
		return `${path} ${parsed.error.issues[0]?.message ?? "is not a valid path"}.`;
	}
	const root = realpathSync(repoRoot);
	const source = join(root, path);
	if (!existsSync(source))
		return `${path} does not exist in the main checkout.`;
	const stat = lstatSync(source);
	if (stat.isSymbolicLink()) return `${path} is a symbolic link.`;
	if (!stat.isFile()) return `${path} is not a regular file.`;
	if (!inside(root, realpathSync(source))) {
		return `${path} resolves outside the repository.`;
	}
	if (stat.size > MAX_WORKTREE_FILE_BYTES) {
		return `${path} is larger than ${MAX_WORKTREE_FILE_BYTES} bytes.`;
	}
	if (git(root, ["ls-files", "--error-unmatch", "--", path]).code === 0) {
		return `${path} is tracked by git; worktrees already have it.`;
	}
	if (
		git(root, ["check-ignore", "--quiet", "--no-index", "--", path]).code !== 0
	) {
		return `${path} is not ignored by git, so copying it could get it committed.`;
	}
	return undefined;
}

export function proposeWorktreeFiles(repoRoot: string): string[] {
	const root = realpathSync(repoRoot);
	const listed = git(root, [
		"ls-files",
		"--others",
		"--ignored",
		"--exclude-standard",
		"--directory",
		"-z",
	]);
	if (listed.code !== 0) throw new Error(`${repoRoot} is not a git checkout.`);
	return listed.stdout
		.split("\0")
		.filter((path) => path.length > 0 && !path.endsWith("/"))
		.filter((path) => checkSource(root, path) === undefined)
		.sort();
}

export function confirmWorktreeFiles(
	repoRoot: string,
	input: unknown,
): WorktreeFiles {
	const config = WorktreeFiles.parse(input);
	const problems = config.files
		.map((path) => checkSource(repoRoot, path))
		.filter((problem): problem is string => problem !== undefined);
	if (problems.length > 0) throw new Error(problems.join(" "));
	const target = join(realpathSync(repoRoot), WORKTREE_FILES_PATH);
	mkdirSync(dirname(target), { recursive: true });
	writeFileSync(target, `${JSON.stringify(config, null, "\t")}\n`);
	return config;
}

export function loadWorktreeFiles(repoRoot: string): WorktreeFiles | undefined {
	const path = join(realpathSync(repoRoot), WORKTREE_FILES_PATH);
	if (!existsSync(path)) return undefined;
	let raw: unknown;
	try {
		raw = JSON.parse(readFileSync(path, "utf8"));
	} catch {
		throw new Error(`${WORKTREE_FILES_PATH} is not valid JSON.`);
	}
	const parsed = WorktreeFiles.safeParse(raw);
	if (!parsed.success) {
		throw new Error(
			`${WORKTREE_FILES_PATH} is malformed; confirm the list again.`,
		);
	}
	return parsed.data;
}

function nearestExisting(path: string): string {
	let current = path;
	while (!existsSync(current)) {
		const parent = dirname(current);
		if (parent === current) break;
		current = parent;
	}
	return current;
}

export interface WorktreeCopyResult {
	copied: string[];
	configured: boolean;
}

export function copyWorktreeFiles(
	repoRoot: string,
	worktreePath: string,
): WorktreeCopyResult {
	const config = loadWorktreeFiles(repoRoot);
	if (!config) return { copied: [], configured: false };
	const root = realpathSync(repoRoot);
	const worktree = realpathSync(worktreePath);
	if (worktree === root) {
		throw new Error("The worktree is the main checkout; nothing to copy.");
	}
	const common = (cwd: string) =>
		realpathSync(
			resolve(cwd, git(cwd, ["rev-parse", "--git-common-dir"]).stdout.trim()),
		);
	if (common(worktree) !== common(root)) {
		throw new Error(`${worktreePath} is not a worktree of this repository.`);
	}
	const problems: string[] = [];
	for (const path of config.files) {
		const problem = checkSource(root, path);
		if (problem) problems.push(problem);
		const target = join(worktree, path);
		if (existsSync(target))
			problems.push(`${path} already exists in the worktree.`);
		const ancestor = realpathSync(nearestExisting(dirname(target)));
		if (ancestor !== worktree && !inside(worktree, ancestor)) {
			problems.push(`${path} would be written outside the worktree.`);
		}
	}
	if (problems.length > 0) throw new Error(problems.join(" "));
	for (const path of config.files) {
		const target = join(worktree, path);
		mkdirSync(dirname(target), { recursive: true });
		copyFileSync(join(root, path), target);
	}
	return { copied: [...config.files], configured: true };
}

if (import.meta.main) {
	const [command, repoRoot, arg] = process.argv.slice(2);
	try {
		if (command === "propose" && repoRoot) {
			console.log(
				JSON.stringify({ files: proposeWorktreeFiles(repoRoot) }, null, 2),
			);
		} else if (command === "confirm" && repoRoot && arg) {
			const config = confirmWorktreeFiles(
				repoRoot,
				JSON.parse(readFileSync(arg, "utf8")),
			);
			console.log(JSON.stringify({ files: config.files }, null, 2));
		} else if (command === "copy" && repoRoot && arg) {
			console.log(JSON.stringify(copyWorktreeFiles(repoRoot, arg), null, 2));
		} else {
			console.error(
				`usage: ${WORKTREE_FILES_PROPOSE_INVOCATION} | ${WORKTREE_FILES_CONFIRM_INVOCATION} | ${WORKTREE_FILES_COPY_INVOCATION}`,
			);
			process.exit(2);
		}
	} catch (error) {
		console.error(error instanceof Error ? error.message : String(error));
		process.exit(1);
	}
}
