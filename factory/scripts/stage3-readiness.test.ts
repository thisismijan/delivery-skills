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
	needsValidation?: string;
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
		...(options?.needsValidation ? [options.needsValidation, ""] : []),
	];
	if (marker) lines.push(marker);
	return `${lines.join("\n")}\n`;
}

function approachPass(options?: {
	head?: string;
	verdict?: string;
	findings?: string;
	needsValidation?: string;
	marker?: string | null;
}): string {
	const head = options?.head ?? HEAD;
	const verdict = options?.verdict ?? "approach is sound";
	const findings = options?.findings ?? "";
	const marker =
		options?.marker === undefined
			? `<!-- mr-review:${head} -->`
			: options.marker;
	const lines = [
		`**Verdict:** ${verdict}`,
		"",
		"### Findings",
		findings,
		"",
		...(options?.needsValidation ? [options.needsValidation, ""] : []),
	];
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

const NV_HEADING = "### Needs validation";
const NV_ITEM = [
	"1. **`src/retry.ts` — the retry loop has no upper bound**",
	"   **Missing fact:** how many replicas of the service run in production.",
	"   **Owner check:** read the replica count for this service in the deploy dashboard.",
].join("\n");
const NV_SECTION = `${NV_HEADING}\n\n${NV_ITEM}`;
const NO_FINDINGS = "No findings.";

function nvItem(options?: { fact?: string; check?: string }): string {
	return [
		"1. **`src/retry.ts` — the retry loop has no upper bound**",
		`   **Missing fact:** ${options?.fact ?? "how many replicas of the service run in production."}`,
		`   **Owner check:** ${options?.check ?? "read the replica count in the deploy dashboard."}`,
	].join("\n");
}

function decide(max: string, approach: string = approachPass()) {
	return decideStage3Readiness({
		iid: IID,
		head: HEAD,
		maxPass: max,
		approachPass: approach,
	});
}

describe("a needs-validation section does not block the code review", () => {
	test("a review whose only open items are needs-validation is ready", () => {
		const result = decide(
			maxPass({ findings: NO_FINDINGS, needsValidation: NV_SECTION }),
		);
		expect(result.decision).toBe("ready");
	});

	test("a severity label in an item's prose keeps the review draft", () => {
		const result = decide(
			maxPass({
				findings: NO_FINDINGS,
				needsValidation: `${NV_HEADING}\n\n${nvItem({
					fact: "how many replicas run. If two replicas run, this is a [High] risk.",
				})}`,
			}),
		);
		expect(result).toEqual({
			decision: "stay-draft",
			reason: "The max-pass review still has blockers.",
		});
	});

	test("a severity label quoted in the owner check keeps the review draft", () => {
		const result = decide(
			maxPass({
				findings: NO_FINDINGS,
				needsValidation: `${NV_HEADING}\n\n${nvItem({
					check:
						"read the count; one replica downgrades this from [Medium] to nothing.",
				})}`,
			}),
		);
		expect(result).toEqual({
			decision: "stay-draft",
			reason: "The max-pass review still has blockers.",
		});
	});

	test("a severity label in a second item's fact keeps the review draft", () => {
		const second = [
			"2. **`src/queue.ts` — the consumer assumes one partition**",
			"   **Missing fact:** how many partitions the orders topic has. More than one is a [High] risk.",
			"   **Owner check:** read the partition count in the broker console.",
		].join("\n");
		const result = decide(
			maxPass({
				findings: NO_FINDINGS,
				needsValidation: `${NV_SECTION}\n\n${second}`,
			}),
		);
		expect(result).toEqual({
			decision: "stay-draft",
			reason: "The max-pass review still has blockers.",
		});
	});

	test("a finding written as an entry inside the section still blocks", () => {
		const result = decide(
			maxPass({
				findings: NO_FINDINGS,
				needsValidation: `${NV_SECTION}\n\n2. **[High] \`src/retry.ts\` — retries without a limit**\n   A real defect.`,
			}),
		);
		expect(result).toEqual({
			decision: "stay-draft",
			reason: "The max-pass review still has blockers.",
		});
	});

	const MISPLACED = [
		["an unnumbered bullet", "- [High] src/retry.ts retries without a limit"],
		["a plain paragraph", "[Medium] src/retry.ts retries without a limit"],
		["a quoted line", "> [High] src/retry.ts retries without a limit"],
		["a lowercase label", "- [high] src/retry.ts retries without a limit"],
	] as const;
	for (const [name, line] of MISPLACED) {
		test(`${name} that starts with a label inside the section blocks`, () => {
			const result = decide(
				maxPass({
					findings: NO_FINDINGS,
					needsValidation: `${NV_SECTION}\n\n${line}`,
				}),
			);
			expect(result.decision).toBe("stay-draft");
			expect(result.reason).toBe("The max-pass review still has blockers.");
		});
	}

	test("a fenced owner check keeps the merge request draft, and a later finding still blocks", () => {
		const fenced = [
			"1. **`src/retry.ts` — the retry loop has no upper bound**",
			"   **Missing fact:** how many replicas of the service run in production.",
			"   **Owner check:** read the replica count:",
			"   ```sh",
			"   # read the replica count",
			"   kubectl get deploy retry -o jsonpath='{.spec.replicas}'",
			"   ```",
		].join("\n");
		const section = `${NV_HEADING}\n\n${fenced}`;
		expect(
			decide(maxPass({ findings: NO_FINDINGS, needsValidation: section })),
		).toEqual({
			decision: "stay-draft",
			reason: "The max-pass review has an incomplete needs-validation item.",
		});
		const withLaterFinding = maxPass({
			findings: NO_FINDINGS,
			needsValidation: `${section}\n\n### Findings\n\n1. **[Medium] \`src/a.ts:8\` — missing test**`,
		});
		expect(decide(withLaterFinding)).toEqual({
			decision: "stay-draft",
			reason: "The max-pass review still has blockers.",
		});
	});

	test("an unclosed fence in the section hides no blocker", () => {
		const open = `${NV_SECTION}\n   \`\`\`sh\n   kubectl get deploy retry\n\n### Findings\n\n1. **[High] \`src/a.ts:4\` — a real defect**`;
		const result = decide(
			maxPass({ findings: NO_FINDINGS, needsValidation: open }),
		);
		expect(result.decision).toBe("stay-draft");
	});

	test("a heading quoted in a fence outside the section hides no finding", () => {
		const result = decide(
			maxPass({
				findings: [
					"```markdown",
					NV_HEADING,
					"```",
					"",
					"1. **[High] `src/a.ts:4` — a real defect**",
				].join("\n"),
			}),
		);
		expect(result.decision).toBe("stay-draft");
	});

	test("a severity finding outside the section blocks beside a clean section", () => {
		const result = decide(
			maxPass({
				findings:
					"1. **[Medium] `src/a.ts:8` — missing test**\n   Changed behaviour is unproved.",
				needsValidation: NV_SECTION,
			}),
		);
		expect(result).toEqual({
			decision: "stay-draft",
			reason: "The max-pass review still has blockers.",
		});
	});

	test("a BLOCK verdict stays draft whatever the section holds", () => {
		const result = decide(
			maxPass({ verdict: "BLOCK", needsValidation: NV_SECTION }),
		);
		expect(result.decision).toBe("stay-draft");
		expect(result.reason).toBe("The max-pass review still has blockers.");
	});

	test("a heading of another level is read as ordinary review text", () => {
		const result = decide(
			maxPass({
				findings: NO_FINDINGS,
				needsValidation: `## Needs validation\n\n${nvItem({
					fact: "how many replicas run. If two replicas run, this is a [High] risk.",
				})}`,
			}),
		);
		expect(result.decision).toBe("stay-draft");
	});

	test("a review with no section and no findings is ready", () => {
		expect(decide(maxPass({ findings: NO_FINDINGS })).decision).toBe("ready");
	});

	test("a closed earlier entry that quotes a severity label keeps the review draft", () => {
		const earlier = [
			"### Earlier findings",
			"",
			"1. **`src/retry.ts` — closed: the retry loop is bounded now**",
			"   **Missing fact:** how many replicas run. Before the fix this was a [High] risk.",
			"",
			"### Findings",
			"",
		].join("\n");
		const result = decide(
			maxPass({
				findings: `${earlier}${NO_FINDINGS}`,
			}),
		);
		expect(result).toEqual({
			decision: "stay-draft",
			reason: "The max-pass review has an incomplete needs-validation item.",
		});
	});

	const closedEntry = (line: string) =>
		[
			"### Earlier findings",
			"",
			"1. **`src/retry.ts` — closed: the retry loop is gone**",
			"   **Missing fact:** how many replicas run.",
			`   ${line}`,
			"",
			"### Findings",
			"",
		].join("\n");

	test("an indented severity label under a closed entry's missing fact still blocks the code review", () => {
		const earlier = closedEntry("[High] `src/new.ts:4` — new defect");
		expect(
			decide(maxPass({ findings: `${earlier}${NO_FINDINGS}` })).decision,
		).toBe("stay-draft");
	});

	test("an indented finding tag under a closed entry's missing fact still blocks the approach pass", () => {
		const earlier = closedEntry("- [bug] `src/new.ts:4` — new defect");
		expect(
			decide(maxPass(), approachPass({ findings: earlier })).decision,
		).toBe("stay-draft");
	});
	test("an unclosed fence inside a closed entry's missing fact keeps a later code finding from hiding", () => {
		const earlier = [
			"### Earlier findings",
			"",
			"1. **`src/retry.ts` — closed: the retry loop is gone**",
			"   **Missing fact:** how many replicas run.",
			"   ```text",
			"",
			"### Findings",
			"",
		].join("\n");
		expect(
			decide(
				maxPass({
					findings: `${earlier}1. **[High] \`src/a.ts:4\` — a real defect**`,
				}),
			),
		).toEqual({
			decision: "stay-draft",
			reason: "The max-pass review has an incomplete needs-validation item.",
		});
	});

	test("an unclosed fence inside a closed entry's missing fact keeps a later approach finding from hiding", () => {
		const earlier = [
			"### Earlier findings",
			"",
			"1. **`src/retry.ts` — closed: the retry loop is gone**",
			"   **Missing fact:** how many replicas run.",
			"   ```text",
			"",
			"### Findings",
			"",
		].join("\n");
		expect(
			decide(
				maxPass(),
				approachPass({
					findings: `${earlier}- [bug] \`src/a.ts:4\` — a real defect`,
				}),
			),
		).toEqual({
			decision: "stay-draft",
			reason:
				"The approach-pass review has an incomplete needs-validation item.",
		});
	});
	test("a fence that opens outside the earlier findings section cannot hide a later finding", () => {
		const findings = [
			"~~~text",
			"### Earlier findings",
			"",
			"1. **`src/retry.ts` — closed: the retry loop is gone**",
			"   **Missing fact:** how many replicas run.",
			"   ```",
			"~~~",
			"",
			"1. **[High] `src/b.ts:4` — a real defect**",
		].join("\n");
		expect(decide(maxPass({ findings }))).toEqual({
			decision: "stay-draft",
			reason: "The max-pass review still has blockers.",
		});
	});

	test("a fence that opens outside the earlier findings section cannot hide a later approach finding", () => {
		const findings = [
			"~~~text",
			"### Earlier findings",
			"",
			"1. **`src/retry.ts` — closed: the retry loop is gone**",
			"   **Missing fact:** how many replicas run.",
			"   ```",
			"~~~",
			"",
			"- [bug] `src/b.ts:4` — a real defect",
		].join("\n");
		expect(decide(maxPass(), approachPass({ findings }))).toEqual({
			decision: "stay-draft",
			reason: "The approach-pass review still has blockers.",
		});
	});

	test("a closed entry with no missing fact keeps the code review draft", () => {
		const findings = [
			"### Earlier findings",
			"",
			"1. **`src/retry.ts` — closed: the retry loop is gone**",
			"",
			"### Findings",
			NO_FINDINGS,
		].join("\n");
		expect(decide(maxPass({ findings }))).toEqual({
			decision: "stay-draft",
			reason: "The max-pass review has an incomplete needs-validation item.",
		});
	});

	test("a closed entry with no missing fact keeps the approach pass draft", () => {
		const findings = [
			"### Earlier findings",
			"",
			"1. **`src/retry.ts` — closed: the retry loop is gone**",
		].join("\n");
		expect(decide(maxPass(), approachPass({ findings }))).toEqual({
			decision: "stay-draft",
			reason:
				"The approach-pass review has an incomplete needs-validation item.",
		});
	});

	test("an emphasis-wrapped label under a closed entry's missing fact still blocks", () => {
		const earlier = closedEntry("*[High]* `src/new.ts:4` — new defect");
		expect(
			decide(maxPass({ findings: `${earlier}${NO_FINDINGS}` })).decision,
		).toBe("stay-draft");
	});

	test("an emphasis-wrapped label in the needs-validation section still blocks", () => {
		expect(
			decide(
				maxPass({
					needsValidation:
						"### Needs validation\n\n*[High]* `src/a.ts:4` — a real defect",
				}),
			),
		).toEqual({
			decision: "stay-draft",
			reason: "The max-pass review still has blockers.",
		});
	});
	test("an underscore-wrapped label under a closed entry's missing fact still blocks the approach pass", () => {
		const earlier = closedEntry("_[bug]_ `src/new.ts:4` — new defect");
		expect(decide(maxPass(), approachPass({ findings: earlier }))).toEqual({
			decision: "stay-draft",
			reason:
				"The approach-pass review has an incomplete needs-validation item.",
		});
	});

	test("an underscore-wrapped label in the needs-validation section still blocks the approach pass", () => {
		expect(
			decide(
				maxPass(),
				approachPass({
					needsValidation:
						"### Needs validation\n\n_[bug]_ `src/a.ts:4` — a real defect",
				}),
			),
		).toEqual({
			decision: "stay-draft",
			reason: "The approach-pass review still has blockers.",
		});
	});

	test("a double-asterisk label under a closed entry's missing fact still blocks the code review", () => {
		const earlier = closedEntry("**[Medium]** `src/new.ts:4` — new defect");
		expect(
			decide(maxPass({ findings: `${earlier}${NO_FINDINGS}` })).decision,
		).toBe("stay-draft");
	});

	test("a long run of emphasis characters is read in linear time, under a closed fact and in the section", () => {
		const started = performance.now();
		const underscores = closedEntry(`   ${"_".repeat(64)}`);
		expect(
			decide(maxPass({ findings: `${underscores}${NO_FINDINGS}` })).decision,
		).toBe("ready");
		const stars = `### Needs validation\n\n${"* ".repeat(40)}`;
		decide(maxPass({ needsValidation: stars }), approachPass());
		expect(performance.now() - started).toBeLessThan(1000);
	});
	test("a finding that continues past a removed needs-validation section cannot take a later would-not-block line with it", () => {
		const approach = approachPass({
			findings: "1. `[bug]` `src/a.ts:142` — wrong default. Breaks callers.",
			needsValidation: [
				"### Needs validation",
				"",
				"1. **`src/cache.ts` — the cache has no expiry**",
				"   **Missing fact:** how long entries live.",
				"   **Owner check:** read the expiry setting.",
				"",
				"- [nit] the titles could be shorter, would not block",
			].join("\n"),
		});
		expect(decide(maxPass(), approach)).toEqual({
			decision: "stay-draft",
			reason: "The approach-pass review still has blockers.",
		});
	});

	test("a finding inside a needs-validation section cannot hide behind a removed item with a would-not-block line", () => {
		const approach = approachPass({
			needsValidation: [
				"### Needs validation",
				"",
				"- [bug] `src/a.ts:142` — wrong default",
				"",
				"2. **`src/cache.ts` — the cache has no expiry**",
				"   **Missing fact:** how long entries live.",
				"   **Owner check:** read the expiry setting.",
				"",
				"- [nit] the titles could be shorter, would not block",
			].join("\n"),
		});
		expect(decide(maxPass(), approach)).toEqual({
			decision: "stay-draft",
			reason: "The approach-pass review still has blockers.",
		});
	});
	test.each([
		["a heading marker", "### [High] `src/b.ts:4` — a real defect"],
		["a task-list checkbox", "- [ ] [High] `src/b.ts:4` — a real defect"],
		[
			"a quote marker and a checkbox",
			"> - [x] [High] `src/b.ts:4` — a real defect",
		],
	])(
		"a label after %s inside a needs-validation section is a finding, not prose",
		(_name, line) => {
			const maxReview = maxPass({
				needsValidation: [
					"### Needs validation",
					"",
					"1. **`src/cache.ts` — the cache has no expiry**",
					"   **Missing fact:** how long entries live.",
					"   **Owner check:** read the expiry setting.",
					`   ${line}`,
				].join("\n"),
			});
			expect(decide(maxReview, approachPass())).toEqual({
				decision: "stay-draft",
				reason: "The max-pass review still has blockers.",
			});
		},
	);

	test.each([
		["a heading marker", "### [bug] `src/a.ts:142` — wrong default"],
		["a task-list checkbox", "- [ ] [bug] `src/a.ts:142` — wrong default"],
	])(
		"a finding tag after %s inside a needs-validation section is a finding in the approach pass",
		(_name, line) => {
			const approach = approachPass({
				needsValidation: [
					"### Needs validation",
					"",
					"1. **`src/cache.ts` — the cache has no expiry**",
					"   **Missing fact:** how long entries live.",
					"   **Owner check:** read the expiry setting.",
					`   ${line}`,
				].join("\n"),
			});
			expect(decide(maxPass(), approach)).toEqual({
				decision: "stay-draft",
				reason: "The approach-pass review still has blockers.",
			});
		},
	);

	test.each([
		["a heading marker", "### [High] `src/b.ts:4` — a real defect"],
		["a task-list checkbox", "- [ ] [High] `src/b.ts:4` — a real defect"],
	])(
		"a label after %s under a closed earlier fact is a finding",
		(_name, line) => {
			const maxReview = maxPass({
				findings: "No findings.",
				needsValidation: [
					"### Earlier findings",
					"",
					"1. **`src/retry.ts` — closed: the loop is gone**",
					"   **Missing fact:** how many replicas run.",
					`   ${line}`,
				].join("\n"),
			});
			expect(decide(maxReview, approachPass())).toEqual({
				decision: "stay-draft",
				reason: "The max-pass review has an incomplete needs-validation item.",
			});
		},
	);
	test.each([
		["a bold list number", "**2.** [High] `src/b.ts:4` — a real defect"],
		["a number with no space", "2.[High] `src/b.ts:4` — a real defect"],
		["a hash number", "#2 [High] `src/b.ts:4` — a real defect"],
		["a dotted number", "1.1 [High] `src/b.ts:4` — a real defect"],
	])(
		"a label after %s inside a needs-validation section keeps the review draft",
		(_name, line) => {
			const result = decide(
				maxPass({
					findings: NO_FINDINGS,
					needsValidation: `${NV_SECTION}\n   ${line}`,
				}),
			);
			expect(result).toEqual({
				decision: "stay-draft",
				reason: "The max-pass review still has blockers.",
			});
		},
	);

	test("a label after an unusual number under a closed earlier fact keeps the review draft", () => {
		const earlier = [
			"### Earlier findings",
			"",
			"1. **`src/retry.ts` — closed: the retry loop is bounded now**",
			"   **Missing fact:** how many replicas run.",
			"   **2.** [High] `src/b.ts:4` — a real defect",
			"",
			"### Findings",
			"",
		].join("\n");
		const result = decide(maxPass({ findings: `${earlier}${NO_FINDINGS}` }));
		expect(result).toEqual({
			decision: "stay-draft",
			reason: "The max-pass review has an incomplete needs-validation item.",
		});
	});

	test("an indented fence left open under an item hides no later finding", () => {
		const section = [
			"1. **`src/retry.ts` — the retry loop has no upper bound**",
			"   **Missing fact:** how many replicas run.",
			"   **Owner check:** read the replica count:",
			"   ```sh",
			"   kubectl get deploy retry",
			"",
			"### Earlier findings",
			"",
			"1. **[High] `src/a.ts:4` — a real defect**",
			"",
			"### Verification",
			"",
			"```sh",
			"echo ok",
			"```",
		].join("\n");
		const result = decide(
			maxPass({
				findings: NO_FINDINGS,
				needsValidation: `${NV_HEADING}\n\n${section}`,
			}),
		);
		expect(result).toEqual({
			decision: "stay-draft",
			reason: "The max-pass review still has blockers.",
		});
	});
	test("a column-0 fence left open in the section hides no later heading or label in the code review", () => {
		const section = [
			NV_SECTION,
			"```sh",
			"kubectl get deploy retry",
			"",
			"### Earlier findings",
			"",
			"1. **[High] `src/a.ts:4` — not fixed at this head**",
			"",
			"### Verification",
			"",
			"```sh",
			"echo ok",
			"```",
		].join("\n");
		const result = decide(
			maxPass({ findings: NO_FINDINGS, needsValidation: section }),
		);
		expect(result.decision).toBe("stay-draft");
	});

	test("a column-0 fence left open in the section hides no later finding tag in the approach pass", () => {
		const section = [
			NV_SECTION,
			"```sh",
			"kubectl get deploy retry",
			"",
			"### Earlier findings",
			"",
			"1. `[bug]` `src/a.ts:4` — not fixed at this head",
		].join("\n");
		const result = decide(
			maxPass(),
			approachPass({ findings: "No findings.", needsValidation: section }),
		);
		expect(result.decision).toBe("stay-draft");
	});
	test("a labelled fence opener does not swallow the item that follows it", () => {
		const section = [
			"1. **`src/a.ts` — first item**",
			"   **Missing fact:** how many replicas run.",
			"   **Owner check:** read the count:",
			"   ```sh [Low]",
			"   kubectl get deploy a",
			"   ```",
			"",
			"2. **`src/b.ts` — second item**",
			"   **Missing fact:** whether the queue is bounded.",
			"   **Owner check:** read the queue config.",
		].join("\n");
		const result = decide(
			maxPass({
				findings: NO_FINDINGS,
				needsValidation: `${NV_HEADING}\n\n${section}`,
			}),
		);
		expect(result).toEqual({
			decision: "stay-draft",
			reason: "The max-pass review has an incomplete needs-validation item.",
		});
	});
	test("a low severity label on an item head keeps the merge request draft", () => {
		const section = [
			"1. **`src/retry.ts` — [Low] retries are unbounded**",
			"   **Missing fact:** how many replicas run.",
			"   **Owner check:** read the replica count.",
		].join("\n");
		const result = decide(
			maxPass({
				findings: NO_FINDINGS,
				needsValidation: `${NV_HEADING}\n\n${section}`,
			}),
		);
		expect(result).toEqual({
			decision: "stay-draft",
			reason: "The max-pass review has an incomplete needs-validation item.",
		});
	});

	test("a nit tag on an item head keeps the approach-pass review draft", () => {
		const section = [
			"1. **`src/retry.ts` — [nit] retries are unbounded**",
			"   **Missing fact:** how many replicas run.",
			"   **Owner check:** read the replica count.",
		].join("\n");
		const result = decide(
			maxPass(),
			approachPass({
				findings: "No findings.",
				needsValidation: `${NV_HEADING}\n\n${section}`,
			}),
		);
		expect(result).toEqual({
			decision: "stay-draft",
			reason:
				"The approach-pass review has an incomplete needs-validation item.",
		});
	});
});

describe("the round-12 readiness cases", () => {
	test("a closed-block earlier finding with a clean section is ready", () => {
		const earlier = [
			"1. **`src/retry.ts` — the retry loop is unbounded**",
			"   ```sh",
			"   kubectl get deploy",
			"   ```",
		].join("\n");
		const body = [
			`## Code review max — !${IID}`,
			"",
			`**Head:** \`${HEAD}\``,
			"**Verdict:** PASS",
			"",
			"### Earlier findings",
			"",
			earlier,
			"",
			"### Findings",
			"",
			NO_FINDINGS,
			"",
			`<!-- code-review-max:mr=${IID} head=${HEAD} -->`,
			"",
		].join("\n");
		expect(decide(body).decision).toBe("ready");
	});

	test("a comment inside the section ends it, so the item after it keeps the merge request draft", () => {
		const section = [
			NV_HEADING,
			"",
			nvItem(),
			"",
			"<!-- reviewer note -->",
			"",
			nvItem({ fact: "how the queue is consumed." }),
		].join("\n");
		const result = decide(
			maxPass({ findings: NO_FINDINGS, needsValidation: section }),
		);
		expect(result).toEqual({
			decision: "stay-draft",
			reason: "The max-pass review has an incomplete needs-validation item.",
		});
	});

	test("an owner-check line under a closed earlier entry keeps the merge request draft", () => {
		const body = [
			`## Code review max — !${IID}`,
			"",
			`**Head:** \`${HEAD}\``,
			"**Verdict:** PASS",
			"",
			"### Earlier findings",
			"",
			"1. **`src/retry.ts` — closed: the retry loop is gone**",
			"   **Missing fact:** how many replicas of the service run in production.",
			"   **Owner check:** read the replica count in the deploy dashboard.",
			"",
			"### Findings",
			"",
			NO_FINDINGS,
			"",
			`<!-- code-review-max:mr=${IID} head=${HEAD} -->`,
			"",
		].join("\n");
		expect(decide(body).decision).toBe("stay-draft");
	});

	test("a needs-validation heading written with a colon keeps the merge request draft", () => {
		const section = `### Needs validation:\n\n${NV_ITEM}`;
		const result = decide(
			maxPass({ findings: NO_FINDINGS, needsValidation: section }),
		);
		expect(result).toEqual({
			decision: "stay-draft",
			reason: "The max-pass review has an incomplete needs-validation item.",
		});
	});

	test("a code block that is never closed before the section keeps the merge request draft", () => {
		const result = decide(
			maxPass({
				findings: "```sh\nkubectl get deploy",
				needsValidation: NV_SECTION,
			}),
		);
		expect(result.decision).toBe("stay-draft");
	});
});

describe("an incomplete needs-validation item keeps the merge request draft", () => {
	test("an item with no owner check stays draft with a plain reason", () => {
		const section = `${NV_HEADING}\n\n1. **\`src/retry.ts\` — the retry loop has no upper bound**\n   **Missing fact:** how many replicas of the service run in production.`;
		const result = decide(
			maxPass({ findings: NO_FINDINGS, needsValidation: section }),
		);
		expect(result).toEqual({
			decision: "stay-draft",
			reason: "The max-pass review has an incomplete needs-validation item.",
		});
	});

	test("an item with no missing fact stays draft with a plain reason", () => {
		const section = `${NV_HEADING}\n\n1. **\`src/retry.ts\` — the retry loop has no upper bound**\n   **Owner check:** read the replica count in the deploy dashboard.`;
		const result = decide(
			maxPass({ findings: NO_FINDINGS, needsValidation: section }),
		);
		expect(result.decision).toBe("stay-draft");
		expect(result.reason).toBe(
			"The max-pass review has an incomplete needs-validation item.",
		);
	});

	test("a plain sentence before the first item stays draft with the same reason", () => {
		const section = `${NV_HEADING}\n\nEverything here depends on how the service is deployed.\n\n${NV_ITEM}`;
		const result = decide(
			maxPass({ findings: NO_FINDINGS, needsValidation: section }),
		);
		expect(result.decision).toBe("stay-draft");
		expect(result.reason).toBe(
			"The max-pass review has an incomplete needs-validation item.",
		);
	});

	test("a real blocker is reported before an incomplete item", () => {
		const section = `${NV_HEADING}\n\n1. **\`src/retry.ts\` — the retry loop has no upper bound**\n   **Missing fact:** how many replicas run.`;
		const result = decide(
			maxPass({
				findings: "1. **[High] `src/a.ts:4` — a real defect**",
				needsValidation: section,
			}),
		);
		expect(result.reason).toBe("The max-pass review still has blockers.");
	});

	test("a stale review is reported before an incomplete item", () => {
		const section = `${NV_HEADING}\n\n1. **\`src/retry.ts\` — the retry loop has no upper bound**\n   **Missing fact:** how many replicas run.`;
		const result = decide(
			maxPass({ head: OTHER_HEAD, needsValidation: section }),
		);
		expect(result.reason).toBe(
			"The max-pass review is for a different commit.",
		);
	});
});

describe("a needs-validation section does not block the approach pass", () => {
	test("a finding tag in an item's prose keeps the review draft", () => {
		const result = decide(
			maxPass(),
			approachPass({
				findings: "No findings.",
				needsValidation: `${NV_HEADING}\n\n${nvItem({
					fact: "how many replicas run. If two replicas run this becomes a [bug] that would block.",
				})}`,
			}),
		);
		expect(result).toEqual({
			decision: "stay-draft",
			reason: "The approach-pass review still has blockers.",
		});
	});

	test("an approach pass carrying the items through is ready", () => {
		const result = decide(
			maxPass({ findings: NO_FINDINGS, needsValidation: NV_SECTION }),
			approachPass({ findings: "No findings.", needsValidation: NV_SECTION }),
		);
		expect(result.decision).toBe("ready");
	});

	test("a labelled paragraph inside the section blocks", () => {
		const result = decide(
			maxPass(),
			approachPass({
				needsValidation: `${NV_SECTION}\n\n[bug] \`src/retry.ts:12\` — wrong default. Breaks callers. would block the merge`,
			}),
		);
		expect(result).toEqual({
			decision: "stay-draft",
			reason: "The approach-pass review still has blockers.",
		});
	});

	test("a labelled bullet inside the section blocks", () => {
		const result = decide(
			maxPass(),
			approachPass({
				needsValidation: `${NV_SECTION}\n\n- [bug] \`src/retry.ts:12\` — wrong default. Breaks callers.`,
			}),
		);
		expect(result.decision).toBe("stay-draft");
		expect(result.reason).toBe("The approach-pass review still has blockers.");
	});

	test("a finding tag outside the section still blocks beside a clean section", () => {
		const result = decide(
			maxPass(),
			approachPass({
				findings:
					"1. `[bug]` `src/a.ts:142` — wrong default. Breaks callers. would block the merge",
				needsValidation: NV_SECTION,
			}),
		);
		expect(result.decision).toBe("stay-draft");
	});

	test("an incomplete item keeps the draft with the approach-pass reason", () => {
		const section = `${NV_HEADING}\n\n1. **\`src/retry.ts\` — the retry loop has no upper bound**\n   **Missing fact:** how many replicas run.`;
		const result = decide(
			maxPass(),
			approachPass({ findings: "No findings.", needsValidation: section }),
		);
		expect(result).toEqual({
			decision: "stay-draft",
			reason:
				"The approach-pass review has an incomplete needs-validation item.",
		});
	});

	test("an unclosed fence in the section hides no blocker", () => {
		const open = `${NV_SECTION}\n   \`\`\`sh\n   kubectl get deploy retry\n\n### Findings\n\n1. \`[bug]\` \`src/a.ts:4\` — wrong default. would block the merge`;
		const result = decide(maxPass(), approachPass({ needsValidation: open }));
		expect(result.decision).toBe("stay-draft");
	});
});
