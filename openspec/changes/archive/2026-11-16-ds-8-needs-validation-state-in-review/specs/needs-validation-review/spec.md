## ADDED Requirements

### Requirement: Adjudication keeps a candidate whose impact needs a fact the repository cannot show
Adjudication in `skills/code-review-max/SKILL.md` SHALL have three outcomes for a candidate: a finding, dropped, or needs-validation. A candidate SHALL be kept as needs-validation, and SHALL NOT be dropped, when all of these hold: the bad behaviour is shown by the code at the pinned head; whether it does harm depends on one named fact that the repository cannot show, such as how a service is deployed or what a setting is in production; the adjudicator searched the repository for that fact, including configuration, manifests, CI deploy jobs, and runbooks, and did not find it; and the adjudicator can state the fact and a safe check for the owner. Adjudication step 7 SHALL apply only to a candidate whose impact or trigger cannot be shown for any other reason, and such a candidate SHALL still be downgraded or dropped. A candidate whose fact the repository does show SHALL be judged by that fact and SHALL NOT be kept as needs-validation. A needs-validation item SHALL record the exact missing fact and one owner check, SHALL carry no severity, and SHALL NOT set the review verdict to `BLOCK`. The owner check SHALL be read-only, in plain language, and SHALL name where the owner looks. The review SHALL NOT run the check and SHALL NOT probe a live environment.

#### Scenario: A risk that depends on a deployment fact is kept
- **GIVEN** a candidate that a retry loop in the changed code is unbounded, and that the harm depends on whether the service runs more than one replica, which no file in the repository states
- **WHEN** adjudication finishes
- **THEN** the candidate is listed as a needs-validation item with the missing fact "how many replicas of the service run in production", an owner check that names where the owner reads the replica count, and no severity, and it is not dropped

#### Scenario: A candidate whose fact the repository shows is judged by that fact
- **GIVEN** a candidate that depends on the replica count, and a deploy manifest in the repository that sets it to one
- **WHEN** adjudication finishes
- **THEN** the candidate is dropped or reported as a finding according to that manifest, and it is not a needs-validation item

#### Scenario: A candidate with no shown bad behaviour is still dropped
- **GIVEN** a candidate whose claim depends only on a name or a reviewer assertion, or whose trigger cannot be shown for a reason that is not a missing fact
- **WHEN** adjudication finishes
- **THEN** it is dropped as before and is not a needs-validation item

#### Scenario: A needs-validation item is incomplete without its fact or its check
- **GIVEN** a needs-validation item that has an empty missing fact, or that has no owner check
- **WHEN** the review output is parsed by `parseNeedsValidationItems` in `factory/scripts/needs-validation.ts` (new)
- **THEN** the parser reports a problem for that item that names which part is missing, and the item is not accepted as complete

#### Scenario: The code review skill states the outcome
- **GIVEN** `skills/code-review-max/SKILL.md`
- **WHEN** its adjudication and severity sections are read
- **THEN** they name needs-validation as an outcome, say it carries no severity and does not set `BLOCK`, say the review does not run the owner check, and keep the rule that an impact which cannot be shown for another reason is downgraded or dropped

### Requirement: A review whose only open items are needs-validation can pass
The code review output SHALL list needs-validation items in a section headed `### Needs validation` placed after `### Findings` and before `### Verification`. Each item SHALL be a numbered entry whose first line is the repository path in backticks, a dash, and a short title in bold, followed by a `**Missing fact:**` line and an `**Owner check:**` line. The section SHALL be omitted when there are no items. A review that has no Critical, High, or Medium finding and has one or more needs-validation items SHALL write `No findings.` under `### Findings`, SHALL record the verdict `PASS`, and SHALL end with the usual marker as its final line. A review that has a Critical, High, or Medium finding SHALL still record `BLOCK`, whatever the needs-validation items are. The heading text SHALL be defined once, as `NEEDS_VALIDATION_HEADING` exported by `factory/scripts/needs-validation.ts` (new).

#### Scenario: Only needs-validation items remain
- **GIVEN** a review with no finding of any severity and one needs-validation item
- **WHEN** the review output is written
- **THEN** `### Findings` says `No findings.`, the verdict is `PASS`, the `### Needs validation` section lists the item, and the marker is the final line

#### Scenario: A real blocker still blocks
- **GIVEN** a review with one High finding and one needs-validation item
- **WHEN** the review output is written
- **THEN** the verdict is `BLOCK`, and the needs-validation item is still listed in its own section and not inside `### Findings`

#### Scenario: The output template and the parser agree on the heading
- **GIVEN** `NEEDS_VALIDATION_HEADING` exported by `factory/scripts/needs-validation.ts` (new)
- **WHEN** the output template in `skills/code-review-max/SKILL.md` and the summary template in `skills/mr-review/SKILL.md` are read
- **THEN** each contains that exact heading text, and the template in `skills/code-review-max/SKILL.md` places it after `### Findings` and before `### Verification`

### Requirement: The second pass carries needs-validation items through and never publishes them as findings
`/mr-review` SHALL carry every needs-validation item from the accepted code review through to its summary under the same `### Needs validation` heading, unchanged in substance, with the same missing fact and owner check. It SHALL NOT tag an item `[bug]`, `[approach]`, or `[nit]`, SHALL NOT count it against the cap of five nits, SHALL NOT include it in `### Findings`, and SHALL NOT write a numbered anchored note file for it. An item SHALL appear only in `summary.md`. Because no note is anchored to it, an item SHALL NOT become a comment that the address-comments scoping returns, and release readiness SHALL NOT count it as an unanswered comment.

#### Scenario: The summary lists the item and posts no inline note
- **GIVEN** an accepted code review with one needs-validation item and no finding, and a second-pass review that finds no problem of its own
- **WHEN** `/mr-review` writes its files
- **THEN** `summary.md` has a `### Needs validation` section with the item, `### Findings` has no entry for it, and there is no `NN-<slug>.md` file for it

#### Scenario: The second pass wording is pinned
- **GIVEN** `skills/mr-review/SKILL.md`
- **WHEN** its consolidation rules and summary template are read
- **THEN** they say needs-validation items are carried through unchanged, are never tagged as findings, never get an anchored note, and appear only in the summary

### Requirement: A needs-validation item has an id that stays the same between review rounds
`factory/scripts/needs-validation.ts` (new) SHALL export `needsValidationId(path, missingFact)`, which returns `NV-` followed by the first eight lowercase hexadecimal characters of the SHA-256 of the normalized path, a newline, and the normalized missing fact. The path is normalized by trimming it and removing a leading `./`. The fact is normalized by trimming it, collapsing every run of whitespace to one space, lowercasing it, and removing trailing `.`, `;`, and `:` characters. The id SHALL NOT depend on the item's title, its number in the list, a line number, or the head. The id SHALL be computed by code and SHALL NOT be written by the reviewer. Two items in one review with the same id SHALL be one item. When a later review of the same merge request finds the same risk, it SHALL copy the earlier missing fact unchanged, so the id is unchanged. When the earlier code is gone at the new head, or the repository now shows the fact, the later review SHALL close that item under `### Earlier findings`, never omit it silently (see the carry-forward requirement below).

#### Scenario: The same risk keeps its id after a push
- **GIVEN** a needs-validation item in a review at one head, and the same path and missing fact written in a review at a later head with a different title and a different position in the list
- **WHEN** `needsValidationId` is called for both
- **THEN** the two ids are equal

#### Scenario: Formatting differences do not change the id
- **GIVEN** two missing facts that differ only in letter case, spacing, or a trailing full stop
- **WHEN** `needsValidationId` is called with the same path for both
- **THEN** the ids are equal, and an id differs when the path or the words of the fact differ

#### Scenario: Two entries for one risk are one item
- **GIVEN** a `### Needs validation` section with two entries that have the same path and the same missing fact
- **WHEN** `parseNeedsValidationItems` reads it
- **THEN** it returns one item

### Requirement: Every review carries earlier needs-validation items forward, whatever its scope or mode
`skills/code-review-max/SKILL.md` SHALL require that a review of a merge request that has an earlier review at another head accounts for every needs-validation item of the most recent earlier review, in a `full` scope review, a `delta` scope review, and a review whose adjudication mode is `none`, `standard`, or any other. An earlier item SHALL be accounted for in exactly one of two ways. It is listed again under `### Needs validation` with its path and its missing fact copied unchanged, or it is closed under `### Earlier findings` as a numbered entry whose first line is the path in backticks, a dash, and the word `closed:` followed by a short title, followed by the `**Missing fact:**` line copied unchanged, and the entry says in its title whether the code is gone or the repository now shows the fact. A `full` scope review SHALL NOT re-derive the item from scratch and reword its fact. When adjudication mode is `none`, the review SHALL still write the carried and closed items, and the statement that there is nothing to verify SHALL apply only to lens candidates. `review-scope.ts` SHALL give the review the head of the earlier review in its output for both scopes, as `previous`, whenever an earlier review exists. When the head of the most recent earlier review is not an ancestor of the head under review, because the branch was rebased or amended, `review-scope.ts` SHALL name that review as `previous` with scope `full`, even when an older earlier review is an ancestor, and say in its reasons that the whole change is reviewed against it, so the earlier items are still carried or closed rather than lost. Only a merge request with no earlier review at all is a first review. An item that is carried or closed SHALL keep the id it had, because the id comes from the path and the unchanged fact.

#### Scenario: A delta review carries the item forward
- **GIVEN** `skills/code-review-max/SKILL.md`
- **WHEN** its delta scope text is read
- **THEN** it says each earlier needs-validation item is listed again with its missing fact copied unchanged, or closed under `### Earlier findings`

#### Scenario: A full scope review carries the item forward
- **GIVEN** an earlier review with one needs-validation item, and a later review whose scope is `full` because the change since then touches a sensitive surface
- **WHEN** the later review is written
- **THEN** the item is listed again under `### Needs validation` with the same path and the same missing fact, or closed under `### Earlier findings`, and it is not omitted and not reworded

#### Scenario: A review with no candidates still lists earlier items
- **GIVEN** an earlier review with one needs-validation item, and a later review in which no lens returns a candidate so the adjudication mode is `none`
- **WHEN** the later review is written
- **THEN** `### Findings` says `No findings.`, the verdict is `PASS`, and the earlier item is still listed under `### Needs validation` or closed under `### Earlier findings`

#### Scenario: The review scope output names the earlier review
- **GIVEN** a merge request with an earlier review at head A, a later head B whose change forces a `full` scope, and a later head C that gives a `delta` scope
- **WHEN** `review-scope.ts` decides the scope for B and for C
- **THEN** its output for B names A as `previous` with scope `full`, its output for C names the same head as `since` and as `previous`, and for a first review it names no `previous`

#### Scenario: A rebased earlier review is still named as previous
- **GIVEN** a merge request whose earlier review is at head A, a branch rebased so that A is no longer in its history, and the rebased head B with the same change
- **WHEN** `review-scope.ts` decides the scope for B
- **THEN** its output has scope `full`, names A as `previous`, and says in its reasons that the whole change is reviewed against it

#### Scenario: A misspelled heading leaves its item unread and a problem
- **GIVEN** a review whose complete item sits under `## Needs validation` rather than `### Needs validation`
- **WHEN** `parseNeedsValidationItems` reads the review
- **THEN** no item is read, and a problem is reported for the missing-fact and owner-check lines outside the section

#### Scenario: A code block that is never closed hides the section
- **GIVEN** a review with a code block opened in its findings that is never closed, followed by a complete needs-validation section
- **WHEN** `parseNeedsValidationItems` reads the review
- **THEN** no item is read and a problem says that a code block is never closed; the command exits 2

#### Scenario: An ordinary earlier finding with a missing-fact line is a problem
- **GIVEN** a `### Earlier findings` entry without `closed:` in its title, with a `**Missing fact:**` line and an `**Owner check:**` line
- **WHEN** `parseNeedsValidationItems` reads the review
- **THEN** a problem is reported, so the entry is not dropped without a line that says why

#### Scenario: A closed entry after an ordinary finding with a closed code block still reads
- **GIVEN** a `### Earlier findings` section whose first entry is an ordinary finding holding a closed fenced shell block, followed by a closed entry with its `**Missing fact:**` line
- **WHEN** `parseClosedNeedsValidation` and `parseNeedsValidationItems` read the review
- **THEN** the closed entry is read with no problem

#### Scenario: An earlier review whose commit the clone no longer holds is still named
- **GIVEN** a merge request whose most recent earlier review is at a head that the clone no longer holds, and the review file for it exists
- **WHEN** `review-scope.ts` decides the scope
- **THEN** its output names that head as `previous` with scope `full`, so the earlier items are still checked

#### Scenario: An amended head names the newest earlier review
- **GIVEN** a merge request with an earlier review at head A, a newer earlier review at head B that is a child of A, and a head C amended from A so that B is outside its history
- **WHEN** `review-scope.ts` decides the scope for C
- **THEN** its output has scope `full` and names B as `previous`, so B's items are checked

#### Scenario: An owner-check line under a closed entry is a problem
- **GIVEN** a `### Earlier findings` entry with `closed:` in its title, followed by its `**Missing fact:**` line and an `**Owner check:**` line
- **WHEN** `parseNeedsValidationItems` reads the review
- **THEN** a problem is reported, and the owner-check line is not read as part of the closed fact

#### Scenario: An indented heading does not start a section
- **GIVEN** a review whose item sits under a heading written with leading spaces, such as `  ### Needs validation`
- **WHEN** `splitNeedsValidation` reads the review
- **THEN** the item is outside the section and is read as review text

#### Scenario: A closed item is a parsed entry
- **GIVEN** a `### Earlier findings` entry `` 1. **`src/retry.ts` — closed: the retry loop is gone** `` followed by the unchanged `**Missing fact:**` line
- **WHEN** the review is read by `parseClosedNeedsValidation` in `factory/scripts/needs-validation.ts` (new)
- **THEN** it returns one closed item with the id of that path and fact, and an entry without a missing fact is reported as a problem

### Requirement: The needs-validation section is read by structure and fails closed
`splitNeedsValidation` in `factory/scripts/needs-validation.ts` (new) SHALL read the section the same way `section` in `factory/scripts/next-action.ts` reads a heading, and SHALL be aware of fenced code blocks, written with three or more backticks or tildes. A line that equals the heading inside a fenced block outside any section SHALL NOT start a section. A code block that opens inside a section SHALL be a problem, because an item is a numbered head with one line for its missing fact and one line for its owner check, and the text from the line that opened the code block to the end of the review SHALL stay outside the section, where the blocker checks read it, so a code block can hide no finding. Inside the section, a line that contains a severity label (`[Critical]`, `[High]`, `[Medium]`, `[Low]`) or a finding tag in brackets (`[bug]`, `[approach]`, `[nit]`) anywhere SHALL be a finding written in the wrong place, whether or not it is numbered, and SHALL stay outside the section with its continuation lines. Any such line SHALL also be a problem whatever its severity, so that an item whose head or fields carry a label is never silently dropped from the acknowledgement gate. A severity word without brackets SHALL be prose. A non-blank line inside the section that comes before the first item head, or that is neither an item head, a `**Missing fact:**` line, an `**Owner check:**` line, nor the continuation of one of them, SHALL be a problem, so that nothing in the section is left unread. A sub-heading or an HTML comment line inside the section SHALL end it, so an item after it is read outside the section and is a problem. A code block that is never closed anywhere in the review SHALL be a problem, and the text after its opening line SHALL NOT be read as the section. A `**Missing fact:**` or `**Owner check:**` line outside the section, and not quoted inside a code block, SHALL be a problem, except the `**Missing fact:**` line of a closed entry under `### Earlier findings`, so that an item under a misspelled heading, or an ordinary earlier finding written with a missing-fact line, is never dropped. An `**Owner check:**` line under `### Earlier findings` SHALL always be a problem. A code block that opens inside a closed entry under `### Earlier findings` SHALL be a problem, because a closed entry is one title line and one missing-fact line; an ordinary earlier finding MAY hold a code block.

#### Scenario: An owner check written as a fenced snippet is a problem
- **GIVEN** a `### Needs validation` section whose item has an owner check followed by a fenced shell block that contains a line beginning `# read the replica count`, and a `[Medium]` finding under a later `### Findings` heading
- **WHEN** `splitNeedsValidation` and `parseNeedsValidationItems` read it
- **THEN** a problem that names a code block is reported, and the `[Medium]` finding is outside the section and still read as a blocker

#### Scenario: A heading inside a fence outside the section does not start one
- **GIVEN** a review whose `### Findings` section quotes the text `### Needs validation` inside a fenced block, followed by a real `[High]` finding
- **WHEN** `splitNeedsValidation` reads it
- **THEN** no section is found for that line and the `[High]` finding is read as before

#### Scenario: A code block in the section is a problem and hides nothing
- **GIVEN** a `### Needs validation` section with a code block that opens inside an item, followed by a `### Findings` heading and a `[High]` finding
- **WHEN** `splitNeedsValidation` and `parseNeedsValidationItems` read it
- **THEN** a problem is reported, and the text from the opening line of the code block to the end of the review is outside the section, so the `[High]` finding is read as a blocker

#### Scenario: An unnumbered labelled line is a finding
- **GIVEN** a `### Needs validation` section that holds a complete item and then the bullet `- [High] src/retry.ts retries without a limit`, and separately a plain paragraph `[Medium] src/retry.ts retries without a limit`
- **WHEN** `splitNeedsValidation` reads each
- **THEN** each labelled line is kept outside the section, where the blocker check reads it, and the complete item is still in the section

#### Scenario: A severity label in the middle of a line is a finding
- **GIVEN** an item whose missing fact reads "if two replicas run, this is a [High] risk"
- **WHEN** `splitNeedsValidation` reads it
- **THEN** that line is kept outside the section and read as a finding, and a severity word without brackets, such as "High risk", stays in the section as prose

#### Scenario: Unreadable text in the section is a problem
- **GIVEN** a `### Needs validation` section with a plain sentence before its first item, or a plain sentence between two items that is not a continuation of a line
- **WHEN** `parseNeedsValidationItems` reads it
- **THEN** it reports a plain problem that quotes the first words of that sentence, and the review is not read as complete

### Requirement: An acknowledgement is an Approvals line scoped to the merge request
A needs-validation item SHALL count as acknowledged only when the run ledger has, in an Approvals section, a single line of the form `- <yyyy-mm-ddThh:mm:ssZ> !<iid> — acknowledged needs-validation <id> — <who> — "<operator's words>"`. The time SHALL be accepted by `isLedgerTime` in `factory/scripts/ledger-store.ts`. The scope SHALL be exactly the merge request number with a leading `!`, and a line scoped to a head, to a key, or to another merge request SHALL NOT acknowledge the item. The id SHALL equal the item's id. The who and the quoted words SHALL each be non-blank. `needsValidationAcknowledgements(ledger)` in `factory/scripts/needs-validation.ts` (new) SHALL read every occurrence of the Approvals section with the section reader that `factory/scripts/ledger-store.ts` exports, and SHALL ignore a line that is not an acknowledgement. An acknowledgement SHALL NOT depend on the head, so it still applies after a push. An acknowledgement whose id matches no current item SHALL be ignored. The line SHALL be written only on the operator's own words. `continuous-delivery: yes`, a risk acceptance, chat history, and a bare "looks fine" SHALL NOT be an acknowledgement. The phrase `acknowledged needs-validation` SHALL be defined once, as `NEEDS_VALIDATION_ACK_PHRASE` exported by `factory/scripts/needs-validation.ts` (new). An acknowledgement says that the owner has seen the missing fact and the check. It does not claim that the risk is gone. Only the coordinator that owns the run ledger SHALL record an acknowledgement. An isolated worker SHALL NOT write one, and the command SHALL read no ledger when `DELIVERY_WORKER_JOURNAL` is set (see the release-readiness requirement on workers).

#### Scenario: A well formed line acknowledges one item
- **GIVEN** a ledger whose Approvals section holds `- 2026-11-16T09:30:00Z !840 — acknowledged needs-validation NV-0a1b2c3d — Sam Rivera — "Checked the replica count with the platform team, it is one."`
- **WHEN** `needsValidationAcknowledgements` reads the ledger
- **THEN** it returns one acknowledgement with merge request `840`, that id, the who, and the words

#### Scenario: A line with the wrong scope is ignored
- **GIVEN** Approvals lines that are scoped to `!841`, to `!840 at <head>`, to a key such as `DS-8`, or that have a date but no time
- **WHEN** `needsValidationAcknowledgements` reads the ledger and the items of merge request 840 are matched against the result
- **THEN** none of those lines acknowledges an item of merge request 840

#### Scenario: A line without who or words is ignored
- **GIVEN** an otherwise valid acknowledgement line whose who is blank, or whose quoted words are blank
- **WHEN** the items are matched against the ledger
- **THEN** the item stays unacknowledged

#### Scenario: The acknowledgement survives a push
- **GIVEN** an acknowledgement for an item at one head, and a later review at a new head that lists the same item with the same id
- **WHEN** the items are matched against the ledger
- **THEN** the item is acknowledged, and no new acknowledgement is asked for

#### Scenario: A needs-validation item is never acknowledged by a standing approval
- **GIVEN** a ledger with `continuous-delivery: yes` and a risk acceptance line for a High finding at the current head, and no acknowledgement line
- **WHEN** the items are matched against the ledger
- **THEN** every item stays unacknowledged

#### Scenario: The ledger format page states the line
- **GIVEN** `NEEDS_VALIDATION_ACK_PHRASE` exported by `factory/scripts/needs-validation.ts` (new)
- **WHEN** `skills/delivery/workflows/delivery-ledger.md` is read
- **THEN** its Approvals rules contain that exact phrase, give the line template with a bullet, a UTC time, the merge request number, the item id, who, and the quoted words, say the scope is the merge request and not a head, and say `continuous-delivery: yes` never authorizes it

#### Scenario: The ledger writer accepts the line without change
- **GIVEN** a ledger and an input that keeps every older line and appends an acknowledgement line that begins with a UTC time
- **WHEN** `factory/scripts/ledger-store.ts` writes it
- **THEN** the write succeeds, and the same line with a date only is refused by the existing time rule

### Requirement: Human-facing text for an item is plain language
The missing fact, the owner check, and the title of an item SHALL be written in plain language that a person who does not know the review's internals can follow, with no raw field names, no severity words used as labels, and no attribution to a tool. Every place in the code that prints an item for a person SHALL pass its text through `sanitizeHumanText` from `factory/scripts/human-text.ts`.

#### Scenario: A printed item is sanitised
- **GIVEN** an item whose missing fact contains an em dash
- **WHEN** the command in `factory/scripts/needs-validation.ts` (new) prints its open items
- **THEN** the printed missing fact and owner check contain a spaced hyphen where the dash was, and the item id is unchanged
