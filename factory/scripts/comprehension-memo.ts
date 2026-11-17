import { existsSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";
import { type ComprehensionMemo, parseFeasibilityVerdict } from "./verdicts";

export const COMPREHENSION_MEMO_FILENAME = "comprehension.md";

// biome-ignore format: the workflow contract reads each invocation as one double-quoted literal
export const COMPREHENSION_MEMO_INVOCATION = "scripts/comprehension-memo.ts write <repoRoot> <changeDir> <feasibility.json>";

export interface MemoResult {
	written: boolean;
	path?: string;
	kept: number;
	dropped: string[];
	reason: string;
}

type Claim = ComprehensionMemo["entryPoints"][number];

// A claim counts only when the file it cites is in the repository; the line
// suffix, if any, is not checked.
function cites(repoRoot: string, file: string): boolean {
	const path = file.replace(/:\d+(?:-\d+)?$/, "");
	if (isAbsolute(path)) return false;
	const target = resolve(repoRoot, path);
	const rel = relative(repoRoot, target);
	if (rel.startsWith("..") || isAbsolute(rel)) return false;
	return existsSync(target);
}

export function renderMemo(
	repoRoot: string,
	memo: ComprehensionMemo,
): { text: string; kept: number; dropped: string[] } {
	const dropped: string[] = [];
	let kept = 0;
	const section = (title: string, claims: Claim[]) => {
		const lines = claims
			.filter((claim) => {
				if (cites(repoRoot, claim.file)) return true;
				dropped.push(`${claim.claim} (${claim.file})`);
				return false;
			})
			.map((claim) => `- ${claim.claim} (\`${claim.file}\`)`);
		kept += lines.length;
		return [
			`## ${title}`,
			"",
			...(lines.length > 0 ? lines : ["None recorded."]),
			"",
		];
	};
	const text = [
		"# Comprehension memo",
		"",
		"What feasibility learned about the code this change touches. Every claim cites a file in the repository; check it there before relying on it.",
		"",
		...section("Entry points", memo.entryPoints),
		...section("Callers", memo.callers),
		...section("Existing tests", memo.tests),
		"## Open questions",
		"",
		...(memo.openQuestions.length > 0
			? memo.openQuestions.map((question) => `- ${question}`)
			: ["None recorded."]),
		"",
	].join("\n");
	return { text, kept, dropped };
}

export function writeMemo(
	repoRoot: string,
	changeDir: string,
	verdictJson: string,
): MemoResult {
	const verdict = parseFeasibilityVerdict(verdictJson);
	if (verdict.complexitySignal === "low") {
		return {
			written: false,
			kept: 0,
			dropped: [],
			reason: "Low-complexity work gets no memo.",
		};
	}
	if (!verdict.comprehension) {
		return {
			written: false,
			kept: 0,
			dropped: [],
			reason: "The feasibility verdict carries no memo, so none is written.",
		};
	}
	const root = realpathSync(repoRoot);
	const { text, kept, dropped } = renderMemo(root, verdict.comprehension);
	if (kept === 0) {
		return {
			written: false,
			kept,
			dropped,
			reason:
				"No claim in the memo cites a file in the repository, so none is written.",
		};
	}
	const path = join(changeDir, COMPREHENSION_MEMO_FILENAME);
	writeFileSync(path, text);
	return {
		written: true,
		path,
		kept,
		dropped,
		reason:
			dropped.length > 0
				? `${dropped.length} claims cited no file in the repository and were left out.`
				: "Every claim cites a file in the repository.",
	};
}

if (import.meta.main) {
	const [command, repoRoot, changeDir, verdictPath] = process.argv.slice(2);
	if (command !== "write" || !repoRoot || !changeDir || !verdictPath) {
		console.error(`usage: ${COMPREHENSION_MEMO_INVOCATION}`);
		process.exit(2);
	}
	try {
		console.log(
			JSON.stringify(
				writeMemo(repoRoot, changeDir, readFileSync(verdictPath, "utf8")),
				null,
				2,
			),
		);
	} catch (error) {
		console.error(error instanceof Error ? error.message : String(error));
		process.exit(1);
	}
}
