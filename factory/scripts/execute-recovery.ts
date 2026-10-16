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

function unattributable(evidence?: AttributableEvidence): boolean {
	return evidence?.present === true && evidence.attributed === false;
}

function escalate(reason: string): ExecuteRecovery {
	return { kind: "escalate", reason };
}

export function recoverExecuting(
	evidence: ExecuteRecoveryEvidence,
): ExecuteRecovery {
	if (unattributable(evidence.branch)) {
		return escalate(
			"The branch is stale or conflicting in a way that cannot be attributed to this execute run. Delivery will not continue or restart from a guess.",
		);
	}
	if (unattributable(evidence.gate)) {
		return escalate(
			"Gate evidence is stale or conflicting in a way that cannot be attributed to this execute run. Delivery will not reuse or discard it.",
		);
	}
	if (unattributable(evidence.dirtyWorktree)) {
		return escalate(
			"The working tree has changes that cannot be attributed to this execute run. Delivery will not discard them or guess whether they belong here.",
		);
	}
	if (evidence.mergeRequest.status === "conflicting") {
		return escalate(
			"An open merge request exists but does not match this execute run. Delivery will not guess which one to use.",
		);
	}
	if (evidence.mergeRequest.status === "matching") {
		return { kind: "review", iid: evidence.mergeRequest.iid };
	}
	if (evidence.owner.status === "active") {
		return {
			kind: "wait",
			reason: `Execute is still running. Wait, then resume with /delivery auto ${evidence.key}.`,
		};
	}
	if (evidence.owner.status === "unknown") {
		return escalate(
			"Delivery cannot tell whether execute is still running. A human needs to inspect it before anything continues.",
		);
	}
	const nextCommand = executeResumeCommand(evidence.key);
	return {
		kind: "interrupted",
		reason: `Execute was interrupted before a merge request existed. Type ${nextCommand} to resume it safely.`,
		nextCommand,
	};
}
