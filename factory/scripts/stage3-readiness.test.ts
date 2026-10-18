import { describe, expect, test } from "bun:test";
import { decideStage3Readiness } from "./stage3-readiness";

const IID = "740";
const HEAD = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const OTHER_HEAD = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

function maxPass(options?: {
	iid?: string;
	head?: string;
	verdict?: string;
	findings?: string;
	marker?: string | null;
}): string {
	const iid = options?.iid ?? IID;
	const head = options?.head ?? HEAD;
	const verdict = options?.verdict ?? "PASS";
	const findings = options?.findings ?? "";
	const marker =
		options?.marker === undefined
			? `<!-- code-review-max:mr=${iid} head=${head} -->`
			: options.marker;
	const lines = [
		`## Code review max — !${iid}`,
		"",
		`**Head:** \`${head}\``,
		`**Verdict:** ${verdict}`,
		"",
		"### Findings",
		findings,
		"",
	];
	if (marker) lines.push(marker);
	return `${lines.join("\n")}\n`;
}

function approachPass(options?: {
	head?: string;
	verdict?: string;
	findings?: string;
	marker?: string | null;
}): string {
	const head = options?.head ?? HEAD;
	const verdict = options?.verdict ?? "approach is sound";
	const findings = options?.findings ?? "";
	const marker =
		options?.marker === undefined
			? `<!-- mr-review:${head} -->`
			: options.marker;
	const lines = [`**Verdict:** ${verdict}`, "", "### Findings", findings, ""];
	if (marker) lines.push(marker);
	return `${lines.join("\n")}\n`;
}

describe("decideStage3Readiness ready", () => {
	test("matching max-pass and approach-pass with no blockers is ready", () => {
		const result = decideStage3Readiness({
			iid: IID,
			head: HEAD,
			maxPass: maxPass(),
			approachPass: approachPass(),
		});
		expect(result.decision).toBe("ready");
	});

	test("Low findings and nits do not block", () => {
		const result = decideStage3Readiness({
			iid: IID,
			head: HEAD,
			maxPass: maxPass({
				findings:
					"1. **[Low] `src/a.ts:1` — small defect**\n   A bounded defect. Would not block.",
			}),
			approachPass: approachPass({
				verdict: "sound with reservations",
				findings:
					"1. `[nit]` `src/a.ts:1` — naming. No concrete cost. would not block",
			}),
		});
		expect(result.decision).toBe("ready");
	});
});

describe("decideStage3Readiness missing stale malformed", () => {
	test("missing max-pass stays draft", () => {
		const result = decideStage3Readiness({
			iid: IID,
			head: HEAD,
			maxPass: null,
			approachPass: approachPass(),
		});
		expect(result.decision).toBe("stay-draft");
	});

	test("missing approach-pass stays draft", () => {
		const result = decideStage3Readiness({
			iid: IID,
			head: HEAD,
			maxPass: maxPass(),
			approachPass: null,
		});
		expect(result.decision).toBe("stay-draft");
	});

	test("stale max-pass head stays draft", () => {
		const result = decideStage3Readiness({
			iid: IID,
			head: HEAD,
			maxPass: maxPass({ head: OTHER_HEAD }),
			approachPass: approachPass(),
		});
		expect(result.decision).toBe("stay-draft");
	});

	test("stale approach-pass head stays draft", () => {
		const result = decideStage3Readiness({
			iid: IID,
			head: HEAD,
			maxPass: maxPass(),
			approachPass: approachPass({ head: OTHER_HEAD }),
		});
		expect(result.decision).toBe("stay-draft");
	});

	test("wrong max-pass iid stays draft", () => {
		const result = decideStage3Readiness({
			iid: IID,
			head: HEAD,
			maxPass: maxPass({ iid: "741" }),
			approachPass: approachPass(),
		});
		expect(result.decision).toBe("stay-draft");
	});

	test("malformed max-pass marker stays draft", () => {
		const result = decideStage3Readiness({
			iid: IID,
			head: HEAD,
			maxPass: maxPass({ marker: "<!-- code-review-max -->" }),
			approachPass: approachPass(),
		});
		expect(result.decision).toBe("stay-draft");
	});

	test("malformed approach-pass marker stays draft", () => {
		const result = decideStage3Readiness({
			iid: IID,
			head: HEAD,
			maxPass: maxPass(),
			approachPass: approachPass({ marker: "<!-- mr-review -->" }),
		});
		expect(result.decision).toBe("stay-draft");
	});

	test("empty artifacts stay draft", () => {
		const result = decideStage3Readiness({
			iid: IID,
			head: HEAD,
			maxPass: "   ",
			approachPass: "",
		});
		expect(result.decision).toBe("stay-draft");
	});
});

describe("decideStage3Readiness blocking evidence", () => {
	test("max-pass BLOCK verdict stays draft", () => {
		const result = decideStage3Readiness({
			iid: IID,
			head: HEAD,
			maxPass: maxPass({ verdict: "BLOCK" }),
			approachPass: approachPass(),
		});
		expect(result.decision).toBe("stay-draft");
	});

	test("mixed PASS and BLOCK verdicts fail closed", () => {
		for (const verdict of ["PASS WITH BLOCKERS", "BLOCK PASS"]) {
			const result = decideStage3Readiness({
				iid: IID,
				head: HEAD,
				maxPass: maxPass({ verdict }),
				approachPass: approachPass(),
			});
			expect(result.decision).toBe("stay-draft");
		}
	});

	test("max-pass High finding stays draft", () => {
		const result = decideStage3Readiness({
			iid: IID,
			head: HEAD,
			maxPass: maxPass({
				findings:
					"1. **[High] `src/a.ts:42` — regression**\n   A likely user-visible regression.",
			}),
			approachPass: approachPass(),
		});
		expect(result.decision).toBe("stay-draft");
	});

	test("blocking severity is case-insensitive", () => {
		for (const severity of ["high", "HIGH", "medium"]) {
			const result = decideStage3Readiness({
				iid: IID,
				head: HEAD,
				maxPass: maxPass({
					findings: `1. **[${severity}] \`src/a.ts:42\` — regression**`,
				}),
				approachPass: approachPass(),
			});
			expect(result.decision).toBe("stay-draft");
		}
	});

	test("max-pass Medium finding stays draft", () => {
		const result = decideStage3Readiness({
			iid: IID,
			head: HEAD,
			maxPass: maxPass({
				findings:
					"1. **[Medium] `src/a.ts:8` — missing test**\n   Changed behaviour is unproved.",
			}),
			approachPass: approachPass(),
		});
		expect(result.decision).toBe("stay-draft");
	});

	test("approach-pass blocking bug stays draft", () => {
		const result = decideStage3Readiness({
			iid: IID,
			head: HEAD,
			maxPass: maxPass(),
			approachPass: approachPass({
				findings:
					"1. `[bug]` `src/a.ts:142` — wrong default. Breaks callers. would block the merge",
			}),
		});
		expect(result.decision).toBe("stay-draft");
	});

	test("approach-pass better-option verdict stays draft", () => {
		const result = decideStage3Readiness({
			iid: IID,
			head: HEAD,
			maxPass: maxPass(),
			approachPass: approachPass({
				verdict: "a better option is worth taking",
			}),
		});
		expect(result.decision).toBe("stay-draft");
	});

	test("a conductor-written ready row without artifacts cannot make it ready", () => {
		const result = decideStage3Readiness({
			iid: IID,
			head: HEAD,
			maxPass: null,
			approachPass: null,
		});
		expect(result.decision).toBe("stay-draft");
		expect(result).not.toHaveProperty("ledgerReview");
	});
});
