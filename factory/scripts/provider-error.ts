const SECRET_ASSIGNMENT =
	/\b(token|secret|password|authorization)\b(\s*[:=]\s*)([^\s,;]+)/gi;
const KNOWN_TOKEN = /\b(?:glpat|ghp|github_pat|xox[baprs])-[A-Za-z0-9_-]+\b/g;
const URL_CREDENTIALS = /(https?:\/\/)[^/\s:@]+:[^/\s@]+@/gi;
const ANSI_COLOR = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, "g");

function removeControlCharacters(value: string): string {
	return [...value]
		.filter((character) => {
			const code = character.charCodeAt(0);
			return code >= 32 && code !== 127;
		})
		.join("");
}

export function safeProviderError(stderr: string): string | undefined {
	const firstLine = stderr
		.split(/\r?\n/)
		.map((line) => line.trim())
		.find(Boolean);
	if (!firstLine) return undefined;
	const clean = removeControlCharacters(firstLine.replace(ANSI_COLOR, ""))
		.replace(URL_CREDENTIALS, "$1[redacted]@")
		.replace(SECRET_ASSIGNMENT, "[credential redacted]")
		.replace(KNOWN_TOKEN, "[redacted]");
	return clean.slice(0, 300);
}

export function providerFailureMessage(options: {
	subject: string;
	operation: string;
	code: number;
	stderr: string;
}): string {
	const detail = safeProviderError(options.stderr);
	return `${options.subject} failed ${options.operation} (exit ${options.code})${detail ? `: ${detail}` : "."}`;
}
