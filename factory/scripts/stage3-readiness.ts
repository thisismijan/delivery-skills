// biome-ignore format: the workflow contract reads each invocation as one double-quoted literal
export const STAGE3_READINESS_INVOCATION = "scripts/stage3-readiness.ts <iid> <head> <max-pass|-> <approach-pass|->";

export type Stage3Decision = "ready" | "stay-draft";

export interface Stage3ReadinessInput {
	iid: string;
	head: string;
	maxPass: string | null;
	approachPass: string | null;
}

export interface Stage3ReadinessResult {
	decision: Stage3Decision;
	reason: string;
}

const MAX_MARKER = /^<!-- code-review-max:mr=(\d+) head=([0-9a-f]{40}) -->$/i;
const APPROACH_MARKER = /^<!-- mr-review:([0-9a-f]{40}) -->$/i;
const MAX_BLOCKING_SEVERITY = /\[(Critical|High|Medium)\]/;
const NON_BLOCKING =
	/would not block|not blocking|does not block|non-blocking/i;

function blank(body: string | null): boolean {
	return body == null || body.trim().length === 0;
}

function lastNonEmptyLine(body: string): string {
	const lines = body.split("\n");
	for (let i = lines.length - 1; i >= 0; i--) {
		const line = lines[i]?.trim() ?? "";
		if (line.length > 0) return line;
	}
	return "";
}

function verdict(body: string): string | null {
	const match = body.match(/\*\*Verdict:\*\*\s*(.+)/i);
	const value = match?.[1]?.trim();
	return value && value.length > 0 ? value : null;
}

function stay(reason: string): Stage3ReadinessResult {
	return { decision: "stay-draft", reason };
}

function sameHead(actual: string, expected: string): boolean {
	return actual.toLowerCase() === expected.toLowerCase();
}

function parseMax(body: string, iid: string, head: string): string | null {
	const marker = MAX_MARKER.exec(lastNonEmptyLine(body));
	if (!marker)
		return "The max-pass review is not valid for this merge request.";
	if (marker[1] !== iid) {
		return "The max-pass review is for a different merge request.";
	}
	if (!sameHead(marker[2] ?? "", head)) {
		return "The max-pass review is for a different commit.";
	}
	const line = verdict(body);
	if (!line) return "The max-pass review is not valid for this merge request.";
	if (/block/i.test(line) && !/pass/i.test(line)) {
		return "The max-pass review still has blockers.";
	}
	if (!/pass/i.test(line)) {
		return "The max-pass review is not valid for this merge request.";
	}
	if (MAX_BLOCKING_SEVERITY.test(body)) {
		return "The max-pass review still has blockers.";
	}
	return null;
}

function findingBlocks(kind: string, text: string): boolean {
	if (kind === "nit") return false;
	return !NON_BLOCKING.test(text);
}

function approachFindingsBlock(body: string): boolean {
	const lines = body.split("\n");
	for (let i = 0; i < lines.length; i++) {
		const start = lines[i] ?? "";
		const kind = start.match(/\[(bug|approach|nit)\]/i)?.[1]?.toLowerCase();
		if (!kind) continue;
		const parts = [start];
		for (let j = i + 1; j < lines.length; j++) {
			const next = lines[j] ?? "";
			if (/^\s*\d+\.\s/.test(next) || /^#{1,6}\s/.test(next)) break;
			if (/^<!-- /.test(next.trim())) break;
			parts.push(next);
		}
		if (findingBlocks(kind, parts.join("\n"))) return true;
	}
	return false;
}

function parseApproach(body: string, head: string): string | null {
	const marker = APPROACH_MARKER.exec(lastNonEmptyLine(body));
	if (!marker) {
		return "The approach-pass review is not valid for this merge request.";
	}
	if (!sameHead(marker[1] ?? "", head)) {
		return "The approach-pass review is for a different commit.";
	}
	const line = verdict(body);
	if (!line) {
		return "The approach-pass review is not valid for this merge request.";
	}
	if (/a better option is worth taking/i.test(line)) {
		return "The approach-pass review still has blockers.";
	}
	if (!/approach is sound|sound with reservations/i.test(line)) {
		return "The approach-pass review is not valid for this merge request.";
	}
	if (approachFindingsBlock(body)) {
		return "The approach-pass review still has blockers.";
	}
	return null;
}

export function decideStage3Readiness(
	input: Stage3ReadinessInput,
): Stage3ReadinessResult {
	if (blank(input.maxPass)) {
		return stay("The max-pass review for this merge request is missing.");
	}
	if (blank(input.approachPass)) {
		return stay("The approach-pass review for this merge request is missing.");
	}
	const maxProblem = parseMax(input.maxPass ?? "", input.iid, input.head);
	if (maxProblem) return stay(maxProblem);
	const approachProblem = parseApproach(input.approachPass ?? "", input.head);
	if (approachProblem) return stay(approachProblem);
	return {
		decision: "ready",
		reason: "Both reviews passed for this commit.",
	};
}

async function readArtifact(arg: string | undefined): Promise<string | null> {
	if (!arg || arg === "-") return null;
	try {
		if (await Bun.file(arg).exists()) return Bun.file(arg).text();
	} catch {
		return null;
	}
	return null;
}

if (import.meta.main) {
	const iid = process.argv[2] ?? "";
	const head = process.argv[3] ?? "";
	const maxPass = await readArtifact(process.argv[4]);
	const approachPass = await readArtifact(process.argv[5]);
	const result = decideStage3Readiness({ iid, head, maxPass, approachPass });
	console.log(JSON.stringify(result));
	process.exit(result.decision === "ready" ? 0 : 1);
}
