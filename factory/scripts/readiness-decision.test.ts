import { describe, expect, test } from "bun:test";
import { decideReadiness, openNeedsValidation } from "./readiness-decision";

const HEAD = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const PREVIOUS_HEAD = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

describe("unverified serious security findings keep blocking", () => {
	test("High finding without reproduction blocks", () => {
		const result = decideReadiness({
			head: HEAD,
			findings: [{ id: "SEC-high", severity: "High", reproduced: false }],
			acceptances: [],
		});
		expect(result.decision).toBe("NO-GO");
		expect(result.blocking).toEqual([
			{ id: "SEC-high", severity: "High", unverified: true },
		]);
	});

	test("Critical finding without reproduction blocks", () => {
		const result = decideReadiness({
			head: HEAD,
			findings: [
				{ id: "SEC-critical", severity: "Critical", reproduced: false },
			],
			acceptances: [],
		});
		expect(result.decision).toBe("NO-GO");
		expect(result.blocking).toEqual([
			{ id: "SEC-critical", severity: "Critical", unverified: true },
		]);
	});

	test("reproduced Critical finding blocks without the unverified marker", () => {
		const result = decideReadiness({
			head: HEAD,
			findings: [
				{
					id: "SEC-reproduced-critical",
					severity: "Critical",
					reproduced: true,
				},
			],
			acceptances: [],
		});
		expect(result.decision).toBe("NO-GO");
		expect(result.blocking).toEqual([
			{
				id: "SEC-reproduced-critical",
				severity: "Critical",
				unverified: false,
			},
		]);
	});

	test("reproduced High finding blocks without the unverified marker", () => {
		const result = decideReadiness({
			head: HEAD,
			findings: [
				{ id: "SEC-reproduced-high", severity: "High", reproduced: true },
			],
			acceptances: [],
		});
		expect(result.decision).toBe("NO-GO");
		expect(result.blocking).toEqual([
			{ id: "SEC-reproduced-high", severity: "High", unverified: false },
		]);
	});

	test("Important finding does not block", () => {
		const result = decideReadiness({
			head: HEAD,
			findings: [
				{ id: "SEC-important", severity: "Important", reproduced: false },
			],
			acceptances: [],
		});
		expect(result.decision).toBe("GO");
		expect(result.blocking).toEqual([]);
	});

	test("Minor finding does not block", () => {
		const result = decideReadiness({
			head: HEAD,
			findings: [{ id: "SEC-minor", severity: "Minor", reproduced: false }],
			acceptances: [],
		});
		expect(result.decision).toBe("GO");
		expect(result.blocking).toEqual([]);
	});
});

describe("operator risk acceptance is recorded and scoped to the assessed head", () => {
	test("acceptance for the current head clears the block", () => {
		const result = decideReadiness({
			head: HEAD,
			findings: [{ id: "SEC-1", severity: "High", reproduced: true }],
			acceptances: [
				{
					findingId: "SEC-1",
					head: HEAD,
					acceptedBy: "Ada Lovelace",
					words: "Accept this named risk for this assessed head.",
				},
			],
		});
		expect(result.decision).toBe("GO");
		expect(result.blocking).toEqual([]);
		expect(result.accepted).toEqual([
			{
				id: "SEC-1",
				severity: "High",
				unverified: false,
				acceptedBy: "Ada Lovelace",
				head: HEAD,
			},
		]);
	});

	test("acceptance for an older head does not apply", () => {
		const result = decideReadiness({
			head: HEAD,
			findings: [{ id: "SEC-1", severity: "Critical", reproduced: false }],
			acceptances: [
				{
					findingId: "SEC-1",
					head: PREVIOUS_HEAD,
					acceptedBy: "Ada Lovelace",
					words: "Accepted on the previous assessed head.",
				},
			],
		});
		expect(result.decision).toBe("NO-GO");
		expect(result.blocking).toEqual([
			{ id: "SEC-1", severity: "Critical", unverified: true },
		]);
		expect(result.accepted).toEqual([]);
	});

	test("acceptance for another finding does not apply", () => {
		const result = decideReadiness({
			head: HEAD,
			findings: [{ id: "SEC-blocking", severity: "High", reproduced: true }],
			acceptances: [
				{
					findingId: "SEC-other",
					head: HEAD,
					acceptedBy: "Ada Lovelace",
					words: "Accept a different finding.",
				},
			],
		});
		expect(result.decision).toBe("NO-GO");
		expect(result.blocking).toEqual([
			{ id: "SEC-blocking", severity: "High", unverified: false },
		]);
	});

	test("acceptance without an operator is ignored", () => {
		const result = decideReadiness({
			head: HEAD,
			findings: [{ id: "SEC-1", severity: "Critical", reproduced: true }],
			acceptances: [
				{
					findingId: "SEC-1",
					head: HEAD,
					acceptedBy: "",
					words: "Words without an operator.",
				},
			],
		});
		expect(result.decision).toBe("NO-GO");
		expect(result.blocking).toEqual([
			{ id: "SEC-1", severity: "Critical", unverified: false },
		]);
	});

	test("acceptance without words is ignored", () => {
		const result = decideReadiness({
			head: HEAD,
			findings: [{ id: "SEC-1", severity: "High", reproduced: true }],
			acceptances: [
				{
					findingId: "SEC-1",
					head: HEAD,
					acceptedBy: "Ada Lovelace",
					words: "",
				},
			],
		});
		expect(result.decision).toBe("NO-GO");
		expect(result.blocking).toEqual([
			{ id: "SEC-1", severity: "High", unverified: false },
		]);
	});

	test("accepted unverified finding stays marked", () => {
		const result = decideReadiness({
			head: HEAD,
			findings: [{ id: "SEC-1", severity: "High", reproduced: false }],
			acceptances: [
				{
					findingId: "SEC-1",
					head: HEAD,
					acceptedBy: "Ada Lovelace",
					words: "Accept this unverified High finding at this head.",
				},
			],
		});
		expect(result.decision).toBe("GO");
		expect(result.blocking).toEqual([]);
		expect(result.accepted).toEqual([
			{
				id: "SEC-1",
				severity: "High",
				unverified: true,
				acceptedBy: "Ada Lovelace",
				head: HEAD,
			},
		]);
	});
});

const IID = "840";

function nvItem(id: string, path = "src/retry.ts") {
	return {
		id,
		path,
		title: "the retry loop has no upper bound",
		missingFact: "how many replicas of the service run in production",
		ownerCheck: "read the replica count in the deploy dashboard",
	};
}

function nvAck(
	itemId: string,
	overrides: Partial<{
		iid: string;
		acknowledgedBy: string;
		words: string;
	}> = {},
) {
	return {
		iid: IID,
		itemId,
		acknowledgedBy: "Sam Rivera",
		words: "Checked the replica count with the platform team.",
		...overrides,
	};
}

const FIRST = nvItem("NV-0a1b2c3d");
const SECOND = nvItem("NV-1b2c3d4e", "src/queue.ts");

describe("an unacknowledged needs-validation item keeps readiness NO-GO", () => {
	test("an item with no finding and no acknowledgement is NO-GO with nothing blocking", () => {
		const result = decideReadiness({
			head: HEAD,
			findings: [],
			acceptances: [],
			iid: IID,
			needsValidation: [FIRST],
			needsValidationAcknowledgements: [],
		});
		expect(result.decision).toBe("NO-GO");
		expect(result.awaitingAcknowledgement.map((item) => item.id)).toEqual([
			FIRST.id,
		]);
		expect(result.blocking).toEqual([]);
		expect(result.accepted).toEqual([]);
	});

	test("every item acknowledged is GO with nothing awaiting", () => {
		const result = decideReadiness({
			head: HEAD,
			findings: [],
			acceptances: [],
			iid: IID,
			needsValidation: [FIRST, SECOND],
			needsValidationAcknowledgements: [nvAck(FIRST.id), nvAck(SECOND.id)],
		});
		expect(result.decision).toBe("GO");
		expect(result.awaitingAcknowledgement).toEqual([]);
		expect(result.blocking).toEqual([]);
	});

	test("one item still open keeps it NO-GO and lists only that item", () => {
		const result = decideReadiness({
			head: HEAD,
			findings: [],
			acceptances: [],
			iid: IID,
			needsValidation: [FIRST, SECOND],
			needsValidationAcknowledgements: [nvAck(FIRST.id)],
		});
		expect(result.decision).toBe("NO-GO");
		expect(result.awaitingAcknowledgement.map((item) => item.id)).toEqual([
			SECOND.id,
		]);
	});

	test("an acknowledgement for another merge request does not apply", () => {
		const result = decideReadiness({
			head: HEAD,
			findings: [],
			acceptances: [],
			iid: IID,
			needsValidation: [FIRST],
			needsValidationAcknowledgements: [nvAck(FIRST.id, { iid: "841" })],
		});
		expect(result.decision).toBe("NO-GO");
		expect(result.awaitingAcknowledgement).toHaveLength(1);
	});

	test("an acknowledgement for another item does not apply", () => {
		const result = decideReadiness({
			head: HEAD,
			findings: [],
			acceptances: [],
			iid: IID,
			needsValidation: [FIRST],
			needsValidationAcknowledgements: [nvAck(SECOND.id)],
		});
		expect(result.decision).toBe("NO-GO");
		expect(result.awaitingAcknowledgement.map((item) => item.id)).toEqual([
			FIRST.id,
		]);
	});

	test("an acknowledgement with no who or no words is ignored", () => {
		for (const overrides of [
			{ acknowledgedBy: "" },
			{ acknowledgedBy: "   " },
			{ words: "" },
			{ words: "   " },
		]) {
			const result = decideReadiness({
				head: HEAD,
				findings: [],
				acceptances: [],
				iid: IID,
				needsValidation: [FIRST],
				needsValidationAcknowledgements: [nvAck(FIRST.id, overrides)],
			});
			expect([overrides, result.decision]).toEqual([overrides, "NO-GO"]);
			expect(result.awaitingAcknowledgement).toHaveLength(1);
		}
	});

	test("items with no merge request number are all left open", () => {
		const result = decideReadiness({
			head: HEAD,
			findings: [],
			acceptances: [],
			needsValidation: [FIRST],
			needsValidationAcknowledgements: [nvAck(FIRST.id)],
		});
		expect(result.decision).toBe("NO-GO");
		expect(result.awaitingAcknowledgement).toHaveLength(1);
	});

	test("an acknowledgement applies at any head", () => {
		for (const head of [HEAD, PREVIOUS_HEAD]) {
			const result = decideReadiness({
				head,
				findings: [],
				acceptances: [],
				iid: IID,
				needsValidation: [FIRST],
				needsValidationAcknowledgements: [nvAck(FIRST.id)],
			});
			expect(result.decision).toBe("GO");
		}
	});

	test("an item is never listed as blocking or accepted and never given a severity", () => {
		const result = decideReadiness({
			head: HEAD,
			findings: [],
			acceptances: [],
			iid: IID,
			needsValidation: [FIRST, SECOND],
			needsValidationAcknowledgements: [nvAck(FIRST.id)],
		});
		expect(result.blocking).toEqual([]);
		expect(result.accepted).toEqual([]);
		for (const item of result.awaitingAcknowledgement) {
			expect(item).not.toHaveProperty("severity");
		}
	});
});

describe("the two clearing paths do not overlap", () => {
	test("a risk acceptance for a High finding does not clear an unacknowledged item", () => {
		const result = decideReadiness({
			head: HEAD,
			findings: [{ id: "SEC-1", severity: "High", reproduced: true }],
			acceptances: [
				{
					findingId: "SEC-1",
					head: HEAD,
					acceptedBy: "Ada Lovelace",
					words: "Accept this named risk for this assessed head.",
				},
			],
			iid: IID,
			needsValidation: [FIRST],
			needsValidationAcknowledgements: [],
		});
		expect(result.decision).toBe("NO-GO");
		expect(result.blocking).toEqual([]);
		expect(result.accepted.map((finding) => finding.id)).toEqual(["SEC-1"]);
		expect(result.awaitingAcknowledgement.map((item) => item.id)).toEqual([
			FIRST.id,
		]);
	});

	test("an acknowledgement does not clear a High finding", () => {
		const result = decideReadiness({
			head: HEAD,
			findings: [{ id: "SEC-1", severity: "High", reproduced: true }],
			acceptances: [],
			iid: IID,
			needsValidation: [FIRST],
			needsValidationAcknowledgements: [nvAck(FIRST.id)],
		});
		expect(result.decision).toBe("NO-GO");
		expect(result.blocking).toEqual([
			{ id: "SEC-1", severity: "High", unverified: false },
		]);
		expect(result.awaitingAcknowledgement).toEqual([]);
	});

	test("an acknowledgement does not clear a Critical finding that was never accepted", () => {
		const result = decideReadiness({
			head: HEAD,
			findings: [{ id: "SEC-2", severity: "Critical", reproduced: false }],
			acceptances: [],
			iid: IID,
			needsValidation: [],
			needsValidationAcknowledgements: [nvAck(FIRST.id)],
		});
		expect(result.decision).toBe("NO-GO");
	});

	test("an accepted finding and an acknowledged item together are GO", () => {
		const result = decideReadiness({
			head: HEAD,
			findings: [{ id: "SEC-1", severity: "High", reproduced: true }],
			acceptances: [
				{
					findingId: "SEC-1",
					head: HEAD,
					acceptedBy: "Ada Lovelace",
					words: "Accept this named risk for this assessed head.",
				},
			],
			iid: IID,
			needsValidation: [FIRST],
			needsValidationAcknowledgements: [nvAck(FIRST.id)],
		});
		expect(result.decision).toBe("GO");
	});
});

describe("readiness without needs-validation input is unchanged", () => {
	test("a GO decision has nothing awaiting acknowledgement", () => {
		const result = decideReadiness({
			head: HEAD,
			findings: [{ id: "SEC-minor", severity: "Minor", reproduced: false }],
			acceptances: [],
		});
		expect(result.decision).toBe("GO");
		expect(result.blocking).toEqual([]);
		expect(result.accepted).toEqual([]);
		expect(result.awaitingAcknowledgement).toEqual([]);
	});

	test("a NO-GO decision has nothing awaiting acknowledgement", () => {
		const result = decideReadiness({
			head: HEAD,
			findings: [{ id: "SEC-high", severity: "High", reproduced: false }],
			acceptances: [],
		});
		expect(result.decision).toBe("NO-GO");
		expect(result.blocking).toEqual([
			{ id: "SEC-high", severity: "High", unverified: true },
		]);
		expect(result.awaitingAcknowledgement).toEqual([]);
	});

	test("an empty list of items is the same as none", () => {
		const result = decideReadiness({
			head: HEAD,
			findings: [],
			acceptances: [],
			iid: IID,
			needsValidation: [],
			needsValidationAcknowledgements: [],
		});
		expect(result.decision).toBe("GO");
		expect(result.awaitingAcknowledgement).toEqual([]);
	});
});

describe("openNeedsValidation is the one rule the decision and the command share", () => {
	test("returns the items that no acknowledgement for this merge request covers", () => {
		expect(
			openNeedsValidation(IID, [FIRST, SECOND], [nvAck(SECOND.id)]).map(
				(item) => item.id,
			),
		).toEqual([FIRST.id]);
	});

	test("agrees with decideReadiness on every case it is given", () => {
		const cases = [
			[nvAck(FIRST.id)],
			[nvAck(FIRST.id, { iid: "841" })],
			[nvAck(FIRST.id, { words: "" })],
			[nvAck(SECOND.id)],
			[],
		];
		for (const acknowledgements of cases) {
			const decided = decideReadiness({
				head: HEAD,
				findings: [],
				acceptances: [],
				iid: IID,
				needsValidation: [FIRST],
				needsValidationAcknowledgements: acknowledgements,
			});
			expect(decided.awaitingAcknowledgement.map((item) => item.id)).toEqual(
				openNeedsValidation(IID, [FIRST], acknowledgements).map(
					(item) => item.id,
				),
			);
		}
	});
});
