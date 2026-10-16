import { describe, expect, test } from "bun:test";
import { decideReadiness } from "./readiness-decision";

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
				{ id: "SEC-reproduced-critical", severity: "Critical", reproduced: true },
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
