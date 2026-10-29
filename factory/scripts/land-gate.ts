import type { ContractCheckResult } from "./sdlc-constitution";

export type LandKind = "change" | "archive";
export type LandDecision = "land" | "wait" | "stop";

export interface LandRequest {
	ref: string;
	headRevision: string;
	kind: LandKind;
	ticketKey: string;
	readNoteIds: string[];
}

export interface LandChangeEvidence {
	state: "open" | "closed" | "merged";
	draft: boolean;
	revisions: { head: string };
	pipeline:
		| { available: false }
		| { available: true; status: string; revision: string; current: boolean };
	mergeability:
		| { available: false }
		| { available: true; conflicts: boolean; status: string };
}

export interface LandApprovalEvidence {
	headRevision: string;
	approval:
		| { available: false }
		| { available: true; approvedBy: string[]; rulesMet: boolean };
}

export interface LandDiscussionEvidence {
	headRevision: string;
	discussions: Array<{ notes: Array<{ id: string; system: boolean }> }>;
}

export interface LandFileEvidence {
	headRevision: string;
	files: Array<{ path: string; previousPath?: string }>;
}

export interface LandGateInput {
	request: LandRequest;
	change: LandChangeEvidence;
	approvals: LandApprovalEvidence;
	discussions: LandDiscussionEvidence;
	files?: LandFileEvidence;
	ledger: string;
	contract: ContractCheckResult;
	contractHash?: string;
}

export interface LandGateResult {
	decision: LandDecision;
	reasons: string[];
}

const PIPELINE_PASSED = new Set(["success"]);
const PIPELINE_RUNNING = new Set([
	"created",
	"pending",
	"preparing",
	"running",
	"scheduled",
	"waiting_for_resource",
	"queued",
	"in_progress",
]);
const MERGEABILITY_PENDING = new Set([
	"checking",
	"unchecked",
	"unknown",
	"approvals_syncing",
]);

function section(markdown: string, title: string): string[] {
	const lines = markdown.split(/\r?\n/);
	const start = lines.findIndex((line) => line.trim() === `## ${title}`);
	if (start < 0) return [];
	const rest = lines.slice(start + 1);
	const end = rest.findIndex((line) => /^##\s/.test(line));
	return end < 0 ? rest : rest.slice(0, end);
}

function cells(row: string): string[] {
	return row
		.trim()
		.replace(/^\|/, "")
		.replace(/\|$/, "")
		.split("|")
		.map((cell) => cell.trim());
}

function bareRef(value: string): string {
	return value.trim().replace(/^[!#]/, "");
}

function mentionsRef(cell: string, ref: string): boolean {
	const wanted = bareRef(ref);
	const found = cell.match(/[!#]?(\d+)/g) ?? [];
	return found.some((token) => bareRef(token) === wanted);
}

export function ledgerReadiness(
	ledger: string,
	ref: string,
): { head: string; verdict: string } | undefined {
	const rows = section(ledger, "Verdicts").filter((line) =>
		line.trim().startsWith("|"),
	);
	let latest: { head: string; verdict: string } | undefined;
	for (const row of rows) {
		const [, mr, kind, head, , , verdict] = cells(row);
		if (!mr || !kind || !head || !verdict) continue;
		if (kind.toLowerCase() !== "readiness") continue;
		if (!mentionsRef(mr, ref)) continue;
		latest = { head, verdict: verdict.toLowerCase() };
	}
	return latest;
}

export function ledgerContinuousDelivery(ledger: string): boolean {
	return section(ledger, "Approvals").some((line) =>
		/continuous-delivery:\s*yes\b/i.test(line),
	);
}

export function ledgerContractHash(ledger: string): string | undefined {
	const line = ledger
		.split(/\r?\n/)
		.find((entry) => /^Run contract:/i.test(entry.trim()));
	return line?.match(/\((sha256:[0-9a-f]{64})\)/)?.[1];
}

function underOpenSpec(path: string): boolean {
	return path.startsWith("openspec/") && !path.split("/").includes("..");
}

export function decideLand(input: LandGateInput): LandGateResult {
	const stop: string[] = [];
	const wait: string[] = [];
	const { request, change } = input;
	const head = request.headRevision;

	if (!input.contract.ok) {
		stop.push(
			`The run contract does not permit landing: ${input.contract.reason ?? "unknown reason"}.`,
		);
	}
	const recordedHash = ledgerContractHash(input.ledger);
	if (!recordedHash || recordedHash !== input.contractHash) {
		stop.push(
			"The run ledger does not name the frozen run contract this land uses.",
		);
	}
	if (!ledgerContinuousDelivery(input.ledger)) {
		stop.push("The run ledger has no continuous-delivery approval.");
	}
	if (request.kind === "change") {
		const readiness = ledgerReadiness(input.ledger, request.ref);
		if (!readiness) {
			stop.push("The run ledger has no readiness verdict for this change.");
		} else if (readiness.verdict !== "go") {
			stop.push("The latest readiness verdict for this change is not GO.");
		} else if (readiness.head !== head) {
			stop.push("The readiness GO was given at a different commit.");
		}
	} else {
		const files = input.files;
		if (!files || files.headRevision !== head) {
			stop.push("The changed files were not read at the head being landed.");
		} else if (files.files.length === 0) {
			stop.push("The archive change touches no files.");
		} else {
			const outside = files.files.filter(
				(file) =>
					!underOpenSpec(file.path) ||
					(file.previousPath !== undefined &&
						!underOpenSpec(file.previousPath)),
			);
			if (outside.length > 0) {
				stop.push(
					`An archive change may only touch openspec files; it also touches ${outside.map((file) => file.path).join(", ")}.`,
				);
			}
		}
	}

	if (change.state === "merged") stop.push("The change is already merged.");
	else if (change.state !== "open") stop.push("The change is not open.");
	if (change.draft) stop.push("The change is still a draft.");
	if (change.revisions.head !== head) {
		stop.push("The change has new commits since the verdict.");
	}

	if (!change.pipeline.available) {
		stop.push("No pipeline ran on the change.");
	} else if (
		change.pipeline.revision !== head &&
		change.pipeline.current !== true
	) {
		stop.push("The pipeline did not run on the head being landed.");
	} else if (PIPELINE_RUNNING.has(change.pipeline.status)) {
		wait.push("The pipeline is still running.");
	} else if (!PIPELINE_PASSED.has(change.pipeline.status)) {
		stop.push(`The pipeline did not pass (${change.pipeline.status}).`);
	}

	if (!change.mergeability.available) {
		stop.push("The forge did not report whether the change can merge.");
	} else if (change.mergeability.conflicts) {
		stop.push("The change has conflicts.");
	} else if (MERGEABILITY_PENDING.has(change.mergeability.status)) {
		wait.push("The forge is still checking whether the change can merge.");
	}

	if (input.approvals.headRevision !== head) {
		stop.push("Approvals were not read at the head being landed.");
	} else if (!input.approvals.approval.available) {
		stop.push("The forge did not report approvals for this change.");
	} else if (
		input.approvals.approval.approvedBy.length === 0 ||
		!input.approvals.approval.rulesMet
	) {
		wait.push("The change is waiting for a person to approve it.");
	}

	if (input.discussions.headRevision !== head) {
		stop.push("Comments were not read at the head being landed.");
	} else {
		const seen = new Set(request.readNoteIds);
		const fresh = input.discussions.discussions
			.flatMap((discussion) => discussion.notes)
			.filter((note) => !note.system && !seen.has(note.id));
		if (fresh.length > 0) {
			stop.push(
				`${fresh.length} comment${fresh.length === 1 ? "" : "s"} arrived after the readiness check; read and answer ${fresh.length === 1 ? "it" : "them"} first.`,
			);
		}
	}

	if (stop.length > 0) return { decision: "stop", reasons: stop };
	if (wait.length > 0) return { decision: "wait", reasons: wait };
	return { decision: "land", reasons: [] };
}
