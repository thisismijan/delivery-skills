export type ExecuteOwner =
	| { status: "none" }
	| { status: "inactive" }
	| { status: "active" }
	| { status: "unknown" };

export type ExecuteMergeRequest =
	| { status: "none" }
	| { status: "matching"; iid: number }
	| { status: "conflicting" };

export type AttributableEvidence =
	| { present: false }
	| { present: true; attributed: true }
	| { present: true; attributed: false };

export type ExecuteRecoveryEvidence = {
	key: string;
	owner: ExecuteOwner;
	mergeRequest: ExecuteMergeRequest;
	branch?: AttributableEvidence;
	gate?: AttributableEvidence;
	dirtyWorktree?: AttributableEvidence;
};

export type ExecuteRecovery =
	| { kind: "review"; iid: number }
	| { kind: "wait"; reason: string }
	| { kind: "interrupted"; reason: string; nextCommand: string }
	| { kind: "escalate"; reason: string };

export function executeResumeCommand(key: string): string {
	return `/delivery execute ${key}`;
}

export function recoverExecuting(
	_evidence: ExecuteRecoveryEvidence,
): ExecuteRecovery {
	return { kind: "wait", reason: "placeholder" };
}
