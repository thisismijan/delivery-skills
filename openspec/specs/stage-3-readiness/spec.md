# stage-3-readiness

## Purpose

Makes the dual Stage 3 review the only authority that can mark the current merge request head ready to leave draft.

## Requirements

### Requirement: Matching dual-review artifacts may undraft the current head
A merge request SHALL be marked ready only when both a max-pass artifact and an approach-pass artifact exist for that merge request, their markers match the current head, and neither artifact records a blocker.

#### Scenario: Validated dual pass with no blockers
- **WHEN** matching max-pass and approach-pass artifacts exist for the current merge request and head, and neither records a blocker
- **THEN** the review decision is ready
- **AND** the merge request may be undrafted

### Requirement: Incomplete review evidence keeps the merge request draft
Malformed, stale, missing, or blocking max-pass or approach-pass evidence SHALL keep the merge request draft. A conductor-written review row MUST NOT undraft the current head or stand in for those artifacts.

#### Scenario: Missing max-pass artifact
- **WHEN** the approach-pass artifact matches the current head and the max-pass artifact is missing
- **THEN** the review decision is stay-draft
- **AND** the merge request remains draft

#### Scenario: Missing approach-pass artifact
- **WHEN** the max-pass artifact matches the current head and the approach-pass artifact is missing
- **THEN** the review decision is stay-draft
- **AND** the merge request remains draft

#### Scenario: Stale artifact head
- **WHEN** either artifact's marker names a different head than the current merge request head
- **THEN** the review decision is stay-draft
- **AND** the merge request remains draft

#### Scenario: Malformed artifact marker
- **WHEN** either artifact is present but its marker cannot be validated
- **THEN** the review decision is stay-draft
- **AND** the merge request remains draft

#### Scenario: Blocking findings
- **WHEN** a matching artifact records a blocker
- **THEN** the review decision is stay-draft
- **AND** the merge request remains draft

#### Scenario: Conductor-written review row is not enough
- **WHEN** the ledger has a ready review row and the dual-review artifacts are missing, stale, malformed, or blocking
- **THEN** the review decision is stay-draft
- **AND** the merge request remains draft
- **AND** release readiness does not proceed as if Stage 3 had passed

### Requirement: Addressed status resumes at dual review
A ticket whose status is `[addressed !N]` SHALL take review as its next step. Resume MUST NOT select address comments for that status.

#### Scenario: Bare key at addressed selects review
- **WHEN** `/delivery <KEY>` runs and the reconciled status is `[addressed !N]`
- **THEN** the selected action is review
- **AND** it is not address comments

### Requirement: A comment round does not mark a new head ready
After comments are addressed, the merge request SHALL stay draft and status
SHALL become `[addressed !N]`. Only Stage 3 review SHALL undraft it or write a
ready review verdict.

#### Scenario: Cumulative gates pass after addressing comments
- **WHEN** comments are addressed on a new head and the cumulative gates pass
- **THEN** the merge request remains draft
- **AND** status becomes `[addressed !N]`

### Requirement: A needs-validation section never blocks a review
`decideStage3Readiness` in `factory/scripts/stage3-readiness.ts` SHALL leave the content of every `### Needs validation` section out of its search for blockers, in both the code review and the second-pass review. A severity label written inside that section, such as `[High]`, SHALL make the code review blocking when it is Critical, High, or Medium, and a finding tag such as `[bug]` written inside it SHALL make the second-pass review blocking, because a label anywhere in a section line is a finding written in the wrong place. A section runs from its heading to the next Markdown heading, to the next HTML comment line, or to the marker line, and a heading, comment, or marker line inside a fenced code block does not end it. A heading that is not exactly `### Needs validation`, such as `## Needs validation` or `### Needs validation:`, does not start a section, so its items are read as text and keep the merge request draft. A code block that is never closed anywhere in the review SHALL keep the merge request draft, and the text after its opening line SHALL NOT be read as the section. Any line inside the section, numbered or not, whether a list entry, a quoted line, or a plain paragraph, that contains a severity label (`[Critical]`, `[High]`, `[Medium]`, or `[Low]`), or a finding tag (`[bug]`, `[approach]`, or `[nit]`), anywhere in the line, is a finding that was written in the wrong place and SHALL be read as one, so a real blocker cannot be hidden by placing it there. A code block that opens inside the section SHALL leave the rest of the review from its opening line on outside the section, where the blocker checks read it. A code block that opens inside the section SHALL keep the merge request draft, because an item holds no code block, and the rest of the review from its opening line on SHALL be read as review text. Both the section and these rules SHALL come from `splitNeedsValidation` in `factory/scripts/needs-validation.ts` (new), so that this file does not hold a second reader. Text outside the section SHALL be read exactly as before. A closed entry under `### Earlier findings` is outside the section too, so the `**Missing fact:**` text of a closed entry is left out of the blocker search, except that a line in that fact that contains a severity label or finding tag anywhere SHALL be read as a finding, in the same way as inside the section. A label or tag counts wherever it sits in the line. Any problem that `parseClosedNeedsValidation` reports for a `### Earlier findings` section, such as a code block that is never closed or a closed entry with no missing fact, SHALL keep the merge request draft with a plain reason, so that no later finding can be hidden behind it. A review whose only open items are in a needs-validation section and whose verdict is `PASS` SHALL leave the decision ready. A needs-validation item that lacks its missing fact or its owner check, as reported by `parseNeedsValidationItems`, SHALL keep the merge request draft with a plain reason that says the review has an incomplete needs-validation item.

#### Scenario: Only needs-validation items leave the decision ready
- **GIVEN** a code review with the verdict `PASS`, `No findings.`, and a needs-validation section with one complete item, and a matching approach pass with no blocker
- **WHEN** `decideStage3Readiness` is called
- **THEN** the decision is ready

#### Scenario: A severity label inside the section blocks
- **GIVEN** a code review with the verdict `PASS` whose needs-validation item has text such as "if more than one replica runs this is a [High] risk"
- **WHEN** `decideStage3Readiness` is called
- **THEN** the decision is stay-draft with the reason that the code review still has blockers

#### Scenario: A finding tag inside the section blocks the approach pass
- **GIVEN** an approach pass whose needs-validation section mentions `[bug]` inside the item's prose, with a sound verdict
- **WHEN** `decideStage3Readiness` is called
- **THEN** the decision is stay-draft with the reason that the approach-pass review still has blockers

#### Scenario: A finding written inside the section still blocks
- **GIVEN** a code review with the verdict `PASS` whose needs-validation section has an entry starting `1. **[High] ` followed by a path and a title
- **WHEN** `decideStage3Readiness` is called
- **THEN** the decision is stay-draft with the reason that the code review still has blockers

#### Scenario: An unnumbered labelled line inside the section blocks
- **GIVEN** a code review with the verdict `PASS` whose needs-validation section holds a complete item and then the bullet `- [High] src/retry.ts retries without a limit`
- **WHEN** `decideStage3Readiness` is called
- **THEN** the decision is stay-draft with the reason that the code review still has blockers

#### Scenario: A labelled paragraph inside the second-pass section blocks
- **GIVEN** an approach pass whose needs-validation section holds a plain paragraph that starts with `[bug]` followed by a path
- **WHEN** `decideStage3Readiness` is called
- **THEN** the decision is stay-draft with the reason that the approach-pass review still has blockers

#### Scenario: A low severity label on an item head keeps the merge request draft
- **GIVEN** a code review with the verdict `PASS` whose needs-validation item head reads `` 1. **`src/retry.ts` — [Low] retries are unbounded** ``, with its missing fact and owner check lines below it
- **WHEN** `decideStage3Readiness` is called
- **THEN** the decision is stay-draft with the reason that the review has an incomplete needs-validation item

#### Scenario: A labelled code block opener inside the section keeps the merge request draft
- **GIVEN** a code review with the verdict `PASS` whose first needs-validation item ends with a code block opener that carries `[Low]`, followed by a complete second item
- **WHEN** `decideStage3Readiness` is called
- **THEN** the decision is stay-draft with the reason that the review has an incomplete needs-validation item

#### Scenario: A fenced owner check keeps the merge request draft
- **GIVEN** a code review with the verdict `PASS` whose needs-validation item ends with an indented fenced shell block containing a line that starts with `# `
- **WHEN** `decideStage3Readiness` is called
- **THEN** the decision is stay-draft with the reason that the review has an incomplete needs-validation item

#### Scenario: A code block inside the section hides no finding
- **GIVEN** a code review with the verdict `PASS` whose needs-validation section holds a complete item, then a code block that is never closed, then a `### Findings` heading and a `[High]` finding
- **WHEN** `decideStage3Readiness` is called
- **THEN** the decision is stay-draft with the reason that the code review still has blockers

#### Scenario: An unclosed fence in the section hides no blocker
- **GIVEN** a code review with the verdict `PASS` whose needs-validation section opens a fence that is never closed and is followed by a `[High]` finding
- **WHEN** `decideStage3Readiness` is called
- **THEN** the decision is stay-draft

#### Scenario: Unreadable text in the section keeps the merge request draft
- **GIVEN** a code review with the verdict `PASS` whose needs-validation section has a plain sentence before its first item
- **WHEN** `decideStage3Readiness` is called
- **THEN** the decision is stay-draft with a plain reason that says the review has an incomplete needs-validation item

#### Scenario: A heading written with a colon or another level keeps the merge request draft
- **GIVEN** a code review with the verdict `PASS` whose complete needs-validation item sits under `### Needs validation:` rather than the exact heading
- **WHEN** `decideStage3Readiness` is called
- **THEN** the decision is stay-draft with the reason that the review has an incomplete needs-validation item

#### Scenario: A sub-heading or comment inside the section ends it
- **GIVEN** a code review with the verdict `PASS` whose needs-validation section holds a complete item, then an HTML comment line, then a second complete item
- **WHEN** `decideStage3Readiness` is called
- **THEN** the decision is stay-draft with the reason that the review has an incomplete needs-validation item

#### Scenario: A never-closed code block before the section keeps the merge request draft
- **GIVEN** a code review with the verdict `PASS` whose findings section opens a code block that is never closed, followed by a complete needs-validation section
- **WHEN** `decideStage3Readiness` is called
- **THEN** the decision is stay-draft

#### Scenario: An ordinary earlier finding with a closed code block stays ready
- **GIVEN** a code review with the verdict `PASS` whose `### Earlier findings` holds an ordinary numbered finding with a fenced shell block that is closed, and no other finding
- **WHEN** `decideStage3Readiness` is called
- **THEN** the decision is ready

#### Scenario: Severity text outside the section still blocks
- **GIVEN** a code review with the verdict `PASS`, a complete needs-validation section, and a `[Medium]` finding under `### Findings`
- **WHEN** `decideStage3Readiness` is called
- **THEN** the decision is stay-draft with the reason that the code review still has blockers

#### Scenario: A real BLOCK verdict is not changed by the section
- **GIVEN** a code review with the verdict `BLOCK` and a needs-validation section
- **WHEN** `decideStage3Readiness` is called
- **THEN** the decision is stay-draft

#### Scenario: An incomplete item keeps the merge request draft
- **GIVEN** a code review with the verdict `PASS` and a needs-validation entry that has no owner check
- **WHEN** `decideStage3Readiness` is called
- **THEN** the decision is stay-draft with a plain reason that names the incomplete needs-validation item

#### Scenario: A review without the section is read as before
- **GIVEN** the existing code review and approach pass inputs that have no needs-validation section
- **WHEN** `decideStage3Readiness` is called
- **THEN** every existing decision and reason is unchanged

### Requirement: Blocking severity is capped by demonstrated impact
The code review SHALL rate a finding no higher than the impact its evidence
shows. A finding whose concrete damage cannot be stated SHALL be Low at most.
Medium or above SHALL need both a named trigger and a stated consequence. A
finding that only weakens a control SHALL rate lower than one that defeats it.

#### Scenario: Damage that cannot be stated
- **WHEN** a candidate's harm cannot be described as what breaks, for whom, and on what input
- **THEN** it is not rated Medium or higher, so it does not block readiness on its own

### Requirement: A confirmed finding carries its variants
After adjudication confirms a finding at Medium or higher, the code review SHALL
search the changed files and their sibling paths in the change's affected areas
for the same root cause, verify each instance, and list it under that finding.
`/address-comments` SHALL fix every listed instance in the same round.

#### Scenario: A sibling instance in the change
- **WHEN** a confirmed Medium finding has the same defect in a sibling file of the change
- **THEN** the sibling is listed under that finding, not raised separately

#### Scenario: A Low finding
- **WHEN** a finding is rated Low
- **THEN** no variant search runs
