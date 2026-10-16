import { readFileSync, realpathSync } from "node:fs";
import { basename, join } from "node:path";

export interface NotePublicationDeps {
	realpath: (path: string) => string;
	readFile: (path: string) => string;
}

export interface NotePublicationInput {
	bodyPath: string;
	repoRoot: string;
	content?: string;
}

export interface NotePublicationResult {
	allowed: boolean;
	reason?: string;
}

const SECRET_NAMES: RegExp[] = [
	/^\.env(?:\.|$)/i,
	/\.pem$/i,
	/^id_rsa/i,
	/^credentials/i,
];

const SECRET_CONTENT: RegExp[] = [
	/\bglpat-[A-Za-z0-9_-]+/,
	/\bghp_[A-Za-z0-9_]+/,
	/\bgho_[A-Za-z0-9_]+/,
	/\bgithub_pat_[A-Za-z0-9_]+/,
	/\bsk-[A-Za-z0-9-]+/,
	/-----BEGIN (?:RSA |OPENSSH |EC )?PRIVATE KEY-----/,
];

function isUnder(child: string, parent: string): boolean {
	const prefix = parent.endsWith("/") ? parent : `${parent}/`;
	return child === parent || child.startsWith(prefix);
}

export function checkNotePublication(
	input: NotePublicationInput,
	deps: NotePublicationDeps,
): NotePublicationResult {
	let bodyReal: string;
	let repoReal: string;
	let reviewReal: string;
	try {
		bodyReal = deps.realpath(input.bodyPath);
		repoReal = deps.realpath(input.repoRoot);
		reviewReal = deps.realpath(join(repoReal, ".review"));
	} catch {
		return { allowed: false, reason: "Could not resolve the note body path." };
	}
	if (!isUnder(bodyReal, reviewReal)) {
		return {
			allowed: false,
			reason: "Note body must resolve under the review directory.",
		};
	}
	const name = basename(bodyReal);
	if (SECRET_NAMES.some((pattern) => pattern.test(name))) {
		return {
			allowed: false,
			reason: "Refusing a secret-bearing file name.",
		};
	}
	let content = input.content;
	if (content === undefined) {
		try {
			content = deps.readFile(bodyReal);
		} catch {
			return { allowed: false, reason: "Could not read the note body." };
		}
	}
	if (SECRET_CONTENT.some((pattern) => pattern.test(content))) {
		return {
			allowed: false,
			reason: "Refusing secret-like content in the note body.",
		};
	}
	return { allowed: true };
}

if (import.meta.main) {
	const [mode, bodyPath, repoRoot] = process.argv.slice(2);
	if (mode !== "check" || !bodyPath || !repoRoot) {
		console.error("usage: note-publication.ts check <bodyPath> <repoRoot>");
		process.exit(2);
	}
	const result = checkNotePublication(
		{ bodyPath, repoRoot },
		{
			realpath: realpathSync,
			readFile: (path) => readFileSync(path, "utf8"),
		},
	);
	if (!result.allowed) {
		console.error(result.reason ?? "Note publication refused.");
		process.exit(1);
	}
}
