## Why

Adjudication in `/code-review-max` can only confirm a candidate or drop it. A candidate that describes a real risk, but whose harm depends on a fact the repository cannot show (how a service is deployed, what a setting is in production), is dropped under the rule "downgrade or drop a finding whose impact or trigger cannot be shown". The operator never hears about it, and the person who owns the fact never gets the chance to check it. Keeping such a risk needs a third outcome that is visible, does not pretend to be a finding with a severity, and does not stop a review that has no real blockers. It also needs a gate before merge, so that "kept" does not turn into "ignored".

## What Changes

- Adjudication gains a third outcome, **needs-validation**. A candidate whose bad behaviour is shown at the pinned head, whose harm depends on one named fact the repository cannot show, and whose fact was searched for in the repository and not found, is kept in that state instead of being dropped. A candidate whose impact cannot be shown for any other reason is still downgraded or dropped as before
- A needs-validation item records the exact missing fact and one safe check the owner can run to settle it. It carries no severity, is never marked Critical, High, Medium, or Low, and does not set the review verdict to `BLOCK`
- The code review output gains a `### Needs validation` section after `### Findings`. A review whose only open items are needs-validation items ends with the verdict `PASS`
- The second-pass review carries the same section through its summary unchanged, never tags an item `[bug]`, `[approach]`, or `[nit]`, and never writes an anchored note file for one, so an item cannot be published as a comment that readiness would later count as unanswered
- The Stage 3 readiness helper reads a needs-validation section as non-blocking: severity words and finding tags written inside it are not read as blockers, while a real finding that is written inside it still blocks, and an item that is missing its fact or its owner check keeps the merge request draft
- Every item gets a stable id that the code derives from the file path and the missing fact, so the same risk keeps its id between review rounds and pushes
- Release readiness is **NO-GO** while any needs-validation item on the merge request has no acknowledgement in the ledger. An acknowledgement is one Approvals line that names the merge request number, the item id, who acknowledged it, and their words. It is scoped to the merge request, not to a head, so it survives a push. Nothing else clears the gate: not a risk acceptance, not `continuous-delivery: yes`, not chat
- The gate is decided by code, not only by prose: the readiness decision helper counts an unacknowledged item as open, and a new command lists the items of a review, matches them to the ledger, and exits non-zero while one is open
- The command fails closed. It is given the merge request number and the live head and refuses a code review file that is empty, has no marker, or names another merge request or commit. It is also given the earlier review and exits non-zero when the review at the head drops an earlier item without listing it or closing it. A worker never reads the run ledger for this gate, and only the coordinator records an acknowledgement
- Every review carries earlier items forward, in a full scope review and in one with no candidates as well as in a delta review
- The section reader is aware of fenced code blocks, reads an unnumbered or bulleted line that starts with a severity label or finding tag inside the section as a blocker, and reports unreadable text in the section as a problem
- Auto routes an open item to the operator in code: the next-action helper gains a classification for it, so the route is not only wording in the auto workflow
- The readiness brief lists the open items in plain language with their id, and the acknowledged items separately

## Capabilities

### New Capabilities

- `needs-validation-review`: the needs-validation outcome of adjudication, what an item records, the stable item id, the output section of both review passes, and the Approvals line that acknowledges an item

### Modified Capabilities

- `stage-3-readiness`: gains a requirement that a needs-validation section never blocks, a misplaced finding still does, and an incomplete item keeps the merge request draft. Existing requirements are not changed
- `release-readiness`: gains a requirement that readiness is NO-GO while a needs-validation item is unacknowledged, that only a ledger acknowledgement scoped to the merge request clears it, and that the workflow wording states this. Existing requirements are not changed

## Out of Scope

- Assigning a severity to a needs-validation item
- Probing a live environment, or running the owner check, to settle the missing fact. The review only writes the check down
- Remembering disproved candidates (slice 9)
- Checking lens coverage (slice 10)
- Closing an item automatically when the owner has run the check. The only closing events are an acknowledgement, or a later review at which the code that raised the item is gone
- Checking that a closed item's code is really gone: the review states it, and the command only checks that an earlier item is accounted for
- Changing the holdout review, its verdict type, the draft-readiness reviewer, or the review summary renderer. The affected-area list named them, but they judge a different thing (a drafted change and an execute round) and carry no adjudicated candidates

## Impact

- `skills/code-review-max/SKILL.md`: adjudication step 7 splits in two, the severity section says a needs-validation item has none, the output template gains the section, and the delta, full, and no-candidate paths all carry earlier items forward
- `skills/mr-review/SKILL.md`: consolidation rules and the summary template carry the section through
- `skills/delivery/workflows/release-readiness.md`: a precondition-style check in the decide step, the brief, the checkpoint table, and the ledger writes
- `skills/delivery/workflows/delivery-ledger.md`: the Approvals line template and the Approvals rules for an acknowledgement
- `skills/delivery/workflows/auto.md`: the `[no-go !N]` row routes an open needs-validation item to the operator, never to the address-comments loop, and the worker rules say a worker never records an acknowledgement
- `skills/delivery/SKILL.md`: the isolated-worker paragraph says a worker reads no run ledger for this gate and only the coordinator records an acknowledgement
- `factory/scripts/next-action.ts` and `factory/scripts/next-action.test.ts`: `noGoNext` gains `acknowledgement`, which stops with a plain reason
- `factory/scripts/review-scope.ts` and `factory/scripts/review-scope.test.ts`: the scope output names the earlier review as `previous` for both scopes
- `factory/scripts/needs-validation.ts` (new): the fence-aware section reader, the parser, the id, the closed-item reader, the ledger acknowledgement reader, and the command
- `factory/scripts/readiness-decision.ts`: counts an unacknowledged item as open
- `factory/scripts/stage3-readiness.ts`: skips a needs-validation section when it looks for blockers, and exports its marker pattern so the new command reads the marker the same way
- `factory/scripts/ledger-store.ts`: exports the existing section reader so the new code does not copy it
- `factory/scripts/needs-validation.test.ts` (new), `factory/scripts/readiness-decision.test.ts`, `factory/scripts/stage3-readiness.test.ts`, `factory/scripts/workflow-contracts.test.ts`, and `skills/delivery/checks/delivery-specs.test.ts`: tests for the above
- `openspec/specs/release-readiness/spec.md` and `openspec/specs/stage-3-readiness/spec.md` take the new requirements at archive
