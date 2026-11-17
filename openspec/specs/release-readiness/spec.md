# release-readiness

## Purpose

Treats security findings by severity, fails closed when evidence cannot be
determined, accepts named risk only for an exact proven head, and follows
pipelines through the open change and exact merged revision.

## Requirements

### Requirement: Unverified serious security findings keep blocking
A Critical or High security finding with incomplete reproduction SHALL keep its severity, SHALL block release, and SHALL be marked unverified. It SHALL NOT be downgraded to Important.

#### Scenario: High finding without reproduction blocks
- **WHEN** readiness is decided for a High security finding that has no complete reproduction
- **THEN** the decision is NO-GO and the finding is listed as blocking and unverified

#### Scenario: Critical finding without reproduction blocks
- **WHEN** readiness is decided for a Critical security finding that has no complete reproduction
- **THEN** the decision is NO-GO and the finding is listed as blocking and unverified

#### Scenario: Reproduced finding blocks without the unverified marker
- **WHEN** readiness is decided for a Critical or High security finding with a complete reproduction
- **THEN** the decision is NO-GO and the finding is listed as blocking and not unverified

#### Scenario: Lower severity does not block
- **WHEN** readiness is decided for security findings that are Important or lower
- **THEN** they do not block release

### Requirement: Operator risk acceptance is recorded and scoped to the assessed head
The operator SHALL be the only party who can accept a blocking Critical or High finding. The acceptance SHALL be recorded for the named finding and the assessed head, with the operator's name and words, and SHALL apply only to that head.

#### Scenario: Acceptance for the current head clears the block
- **WHEN** readiness is recomputed with an operator acceptance naming the finding and the current head
- **THEN** the finding is listed as accepted with the operator and head, and it no longer blocks

#### Scenario: Acceptance for an older head does not apply
- **WHEN** readiness is recomputed after the head changed and the only acceptance names the previous head
- **THEN** the finding blocks again and the decision is NO-GO

#### Scenario: Acceptance for another finding does not apply
- **WHEN** an acceptance names a different finding than the blocking one
- **THEN** the blocking finding stays blocking

#### Scenario: Acceptance without an operator or words is ignored
- **WHEN** an acceptance has no operator name or no recorded words
- **THEN** it does not clear the block

#### Scenario: Accepted unverified finding stays marked
- **WHEN** an unverified finding is accepted for the current head
- **THEN** the accepted record still shows it as unverified

### Requirement: The readiness workflow states the fail-closed rule
The release readiness workflow SHALL state that unverified Critical and High findings block, are marked unverified, and are accepted only by the operator for the assessed head.

#### Scenario: Workflow wording is pinned
- **WHEN** the release readiness workflow is read
- **THEN** it contains no downgrade of an unproven Critical or High finding, names Critical and High in the NO-GO rule, requires head-scoped operator acceptance, and shows the unverified marker in the brief

### Requirement: Pipelines are monitored through merge
Delivery SHALL observe the open-change pipeline for the exact current head and,
after a human merge, the default-branch pipeline for the exact normalized
merged revision. Waiting SHALL use host event subscriptions when available and
SHALL NOT busy-poll.

#### Scenario: Open-change pipeline is running
- **WHEN** current-head pipeline evidence is pending or running
- **THEN** delivery records the exact revision, subscribes when supported, ends the turn, and re-reads normalized evidence when resumed

#### Scenario: Merge completes
- **WHEN** the change becomes merged
- **THEN** delivery requests pipeline evidence for `revisions.merged` and does not reuse the open-change pipeline as default-branch proof

### Requirement: Pipeline failures route safely
An attributable pipeline failure MAY fix forward only within the frozen run
contract and bounded repair budget. A transient, unrelated, unknown,
out-of-scope, contradictory, or exhausted failure SHALL escalate with evidence.
Delivery SHALL NOT merge, revert, force-push, retry provider CI blindly, or
push directly to the default branch.

#### Scenario: Open-change failure is attributable
- **WHEN** evidence attributes the failure to the patch and the repair is in scope and below the budget
- **THEN** delivery repairs the existing branch and reruns every invalidated gate and review at the new head

#### Scenario: Default-branch failure is attributable
- **WHEN** the exact merged revision fails and the repair remains approved and below the budget
- **THEN** delivery creates a new reviewed recovery change and leaves its merge to a human

#### Scenario: Failure cannot be repaired automatically
- **WHEN** attribution is not proven, scope would expand, provider retry is required, or the budget is exhausted
- **THEN** delivery escalates with the exact revision, failed checks, sanitized evidence, and recommended next owner

### Requirement: Comments on an open change are answered before it is queued
Delivery SHALL check back on a change after opening it and SHALL treat any unanswered comment on it as a NO-GO comment blocker before reporting it ready to merge or queue.
Comments come from people or automated reviewers who often comment only once a
change is posted. A comment is unanswered when the address-comments scoping
still returns it and the run did not publish it itself.

#### Scenario: The change is opened early
- **WHEN** the first holdout review of an execute run returns approve
- **THEN** execute opens the draft change in that step, without further local review rounds

#### Scenario: A comment on the change is unanswered
- **WHEN** release readiness, or the check before a GO change is queued, finds an unanswered comment at the current head
- **THEN** the verdict is NO-GO with the comment listed as a comment blocker, and no risk acceptance can clear it

#### Scenario: Open comments are fixed together
- **WHEN** a NO-GO lists unanswered comments
- **THEN** one address-comments round handles every open comment with the usual test-first and green gates, counts as one review round, replies once per thread under the operator's own forge identity, and resolves none

### Requirement: Classification and the bar check start from the diff scan

Release readiness SHALL run the diff scan on the pinned base and head before classifying the change and checking the bar. Every scanned surface, one-way signal, and lowered-bar hit SHALL be kept. The model MAY add marks it proves from the diff and SHALL NOT remove scanned ones. A non-zero scan exit SHALL stop the stage.

#### Scenario: Workflow wording is pinned
- **WHEN** the release readiness workflow is read
- **THEN** it names the diff scan command, says scanned marks are never removed, and says a non-zero exit stops the stage

### Requirement: Empty and small diffs skip readiness-lens subagents

Release readiness SHALL measure the pinned diff with `review-fanout.ts measure` and SHALL take `review-fanout.ts readiness` as the dispatch plan. An `empty` mode SHALL dispatch no lens subagent and SHALL NOT run the rollback lens in the main conversation. A `small` mode SHALL dispatch no lens subagent and SHALL run the rollback lens in the main conversation. A `full` mode SHALL run the lenses the classification turned on. Malformed input SHALL stop the stage.

#### Scenario: Workflow wording is pinned
- **WHEN** the release readiness workflow is read
- **THEN** it names `review-fanout.ts readiness`, says `empty` skips the rollback lens in this conversation, says `small` runs that lens here, and says a non-zero exit stops the stage

### Requirement: Readiness lens subagents use the resolved standard model

Every release-readiness lens subagent SHALL use the exact model identifier returned by resolving the `standard` capability against the recorded runtime inventory. The main conversation SHALL still synthesise GO or NO-GO, drop Stage 3 duplicates, keep unverified Critical and High findings blocking, and write the brief. A missing live standard candidate SHALL stop the stage. Fast-tier models SHALL NOT run these lenses.

#### Scenario: Workflow wording is pinned
- **WHEN** the release readiness workflow is read
- **THEN** it names `resolve standard`, says that exact identifier is passed to every lens subagent, says the main conversation still decides GO or NO-GO, and does not dispatch a fast model for those lenses

### Requirement: The readiness brief shows decisions and what the checks leave open
The release-readiness brief SHALL always include "Decisions to know about" and
"What the checks do not prove", taken from the change description and extended
with what later rounds decided and what the stage's own checks leave open. The
second section SHALL NOT be empty. Review lenses SHALL receive the listed
decisions as choices to challenge.

#### Scenario: A GO brief
- **WHEN** readiness issues a GO
- **THEN** the brief still names what the passing checks do not prove

#### Scenario: A decision made while answering comments
- **WHEN** a fix for a review comment chose a behaviour the spec did not state
- **THEN** the brief lists it under decisions to know about

### Requirement: Readiness is NO-GO while a needs-validation item is unacknowledged
Release readiness SHALL be NO-GO while any needs-validation item of the merge request has no acknowledgement recorded in the run ledger, and SHALL stop being NO-GO for that reason once every item has one. The decision SHALL be made by code. `decideReadiness` in `factory/scripts/readiness-decision.ts` SHALL accept an optional merge request number, an optional list of needs-validation items, and an optional list of acknowledgements, SHALL treat an item as open unless an acknowledgement has the same merge request number, the same item id, a non-blank who, and non-blank words, and SHALL return the open items as `awaitingAcknowledgement`. An open item SHALL make the decision NO-GO even when no Critical or High finding exists. An item SHALL NOT be a blocking finding, SHALL NOT be given a severity, and SHALL NOT be listed in `blocking` or `accepted`. An acknowledgement SHALL NOT depend on the head. When none of the three optional inputs is given, the result of `decideReadiness` SHALL be what it was before this change, with `awaitingAcknowledgement` empty. No acknowledgement SHALL clear a Critical or High finding, and no risk acceptance SHALL clear a needs-validation item.

#### Scenario: An unacknowledged item makes the decision NO-GO
- **GIVEN** no Critical or High finding, and one needs-validation item on merge request 840 with no acknowledgement
- **WHEN** `decideReadiness` is called
- **THEN** the decision is NO-GO, `awaitingAcknowledgement` holds that item, and `blocking` is empty

#### Scenario: Every item acknowledged makes the decision GO
- **GIVEN** two needs-validation items on merge request 840 and one acknowledgement for each, with a non-blank who and words
- **WHEN** `decideReadiness` is called
- **THEN** the decision is GO, and `awaitingAcknowledgement` is empty

#### Scenario: One item still open keeps it NO-GO
- **GIVEN** two items and an acknowledgement for only one
- **WHEN** `decideReadiness` is called
- **THEN** the decision is NO-GO and `awaitingAcknowledgement` holds only the other item

#### Scenario: An acknowledgement for another merge request or another item does not apply
- **GIVEN** an item on merge request 840, and acknowledgements that name merge request 841, or a different item id
- **WHEN** `decideReadiness` is called
- **THEN** the item stays open and the decision is NO-GO

#### Scenario: An acknowledgement without a who or words is ignored
- **GIVEN** an acknowledgement with a blank who, or blank words
- **WHEN** `decideReadiness` is called
- **THEN** the item stays open

#### Scenario: A risk acceptance does not clear an item and an acknowledgement does not clear a finding
- **GIVEN** a High finding that has an operator acceptance for the current head and an unacknowledged item, and separately a High finding with no acceptance and an acknowledged item
- **WHEN** `decideReadiness` is called for each
- **THEN** both decisions are NO-GO

#### Scenario: Readiness without needs-validation input is unchanged
- **GIVEN** the inputs of the existing `decideReadiness` tests, which carry no needs-validation fields
- **WHEN** `decideReadiness` is called
- **THEN** each decision, blocking list, and accepted list is what it was, and `awaitingAcknowledgement` is empty

### Requirement: A command checks the items of a review against the ledger
`factory/scripts/needs-validation.ts` (new) SHALL be runnable as `scripts/needs-validation.ts <iid> <head> <max-pass> <ledger> <previous-max-pass>`, where `<head>` is the full live head commit, `<max-pass>` is the pinned code review file, `<ledger>` is the run ledger file or `-` for no ledger, and `<previous-max-pass>` is the earlier review named as `previous` by `review-scope.ts` or `-` when there is none. All five arguments are required, and a missing one is a usage error that exits 2. Before it reads any item, the command SHALL check that `<max-pass>` is not empty, ends with the marker `<!-- code-review-max:mr=<iid> head=<head> -->` as its last non-blank line for the same merge request number and the same head, and records a verdict, using the marker pattern that `factory/scripts/stage3-readiness.ts` exports so that file and this one share one reading. A file that is empty, has no marker, names another merge request or another commit, or has no verdict SHALL exit 2 and never exit 0. The command SHALL print one JSON object with the keys `items`, `closed`, `open`, `problems`, and `ledgerRead`, where `items` holds every item with its id, path, title, missing fact, owner check, and whether it is acknowledged, `closed` holds the items closed under `### Earlier findings`, `open` holds the unacknowledged items, and `problems` holds a plain message for each incomplete item, each unreadable line in the section, each unclosed fence, and each earlier item that the review neither lists nor closes. An item of the earlier review whose id is neither among the items nor among the closed items of `<max-pass>` SHALL be a problem. It SHALL exit 0 when the review has no open item and no problem, 1 when at least one item is open and there is no problem, and 2 when there is a problem or an input cannot be read. A review with a valid marker and no needs-validation section, and no earlier item, SHALL exit 0. When `DELIVERY_WORKER_JOURNAL` is set, the command SHALL read no ledger, so every item is open, and its output SHALL carry `ledgerRead` as false. The command SHALL decide openness with the same function that `decideReadiness` uses. The invocation text SHALL be defined once, as `NEEDS_VALIDATION_CHECK_INVOCATION` exported by that file.

#### Scenario: Open items exit 1
- **GIVEN** a code review file with a valid marker for merge request 840 and the live head, two complete items, and a ledger that acknowledges one of them
- **WHEN** the command is run
- **THEN** it exits 1, and `open` holds only the other item

#### Scenario: All items acknowledged exit 0
- **GIVEN** a code review file with a valid marker and two items, and a ledger that acknowledges both on the same merge request
- **WHEN** the command is run
- **THEN** it exits 0 and `open` is empty

#### Scenario: A review with no section exits 0
- **GIVEN** a code review file with a valid marker and no needs-validation section, and `-` for the earlier review
- **WHEN** the command is run
- **THEN** it exits 0 and `items` is empty

#### Scenario: An incomplete item or an unreadable input exits 2
- **GIVEN** a code review file with an item that has no owner check, or a code review path that does not exist
- **WHEN** the command is run
- **THEN** it exits 2 and prints a plain message that says which

#### Scenario: A missing ledger leaves every item open
- **GIVEN** a code review file with a valid marker and one complete item, and `-` as the ledger
- **WHEN** the command is run
- **THEN** it exits 1 with that item open

#### Scenario: A file that is not this review of this head exits 2
- **GIVEN** a code review file that is empty, or that has no marker, or whose marker names merge request 841, or whose marker names an older head, or that has a marker and no verdict
- **WHEN** the command is run for merge request 840 at the live head
- **THEN** it exits 2 with a plain message that names which check failed, and it does not exit 0

#### Scenario: A missing argument is a usage error
- **GIVEN** the command run without the earlier review argument
- **WHEN** the command is run
- **THEN** it exits 2 with a usage message

#### Scenario: A review that drops an earlier item exits 2
- **GIVEN** an earlier review with one needs-validation item, and a review at the live head that neither lists that item nor closes it, whether the review is `full` scope, `delta` scope, or has no findings at all
- **WHEN** the command is run with the earlier review as the last argument
- **THEN** it exits 2 with a plain message that names the item's path and title, and `open` does not hide it

#### Scenario: A carried or closed earlier item is accepted
- **GIVEN** an earlier review with two items, and a review at the live head that lists one again with the same missing fact and closes the other under `### Earlier findings`
- **WHEN** the command is run with the earlier review as the last argument
- **THEN** it exits 1 or 0 by the acknowledgement of the listed item only, `closed` holds the other item, and the closed item is never open and needs no acknowledgement

#### Scenario: A worker reads no ledger
- **GIVEN** `DELIVERY_WORKER_JOURNAL` set to a journal path, and a ledger file that holds a valid acknowledgement for the only item
- **WHEN** the command is run
- **THEN** it exits 1 with the item open, and its output carries `ledgerRead` as false

### Requirement: The readiness workflow states the needs-validation gate
`skills/delivery/workflows/release-readiness.md` SHALL, in its step that decides GO or NO-GO, list an unacknowledged needs-validation item as a NO-GO reason, name the command by `NEEDS_VALIDATION_CHECK_INVOCATION`, say the exit codes, and say that the command is given the live head and the earlier review that `review-scope.ts` names as `previous` (or `-`), and that exit 2 stops the stage. It SHALL say that only an Approvals line scoped to the merge request clears an item, that risk acceptance and `continuous-delivery: yes` do not, and that the item is not a finding and has no severity. The brief SHALL gain a `### Facts to confirm before merging` section that lists each open item in plain language with its id, the missing fact, and the owner check, and a `### Facts acknowledged` section that lists each acknowledged item with who acknowledged it and when. A section with nothing in it SHALL be left out. The checkpoint table SHALL gain a row for the operator acknowledging an item that records the Approvals line, recomputes the verdict, and reissues the brief. The ledger writes SHALL record each acknowledged item in Approvals and the number of open items in Decisions. An open needs-validation item SHALL NOT be reported as an unanswered comment, and it SHALL NOT be sent to address-comments. The `[no-go !N]` row of `skills/delivery/workflows/auto.md` SHALL send an open item to the operator and SHALL NOT loop on it.

#### Scenario: The workflow names the gate
- **GIVEN** `skills/delivery/workflows/release-readiness.md`
- **WHEN** its decide step, brief template, checkpoint table, and ledger writes are read
- **THEN** the NO-GO list names an unacknowledged needs-validation item, the command text equals `NEEDS_VALIDATION_CHECK_INVOCATION`, the brief has the two sections, the checkpoint table has the acknowledgement row, and the ledger writes name the Approvals line and the Decisions count

#### Scenario: The workflow keeps the item out of comments and risk acceptance
- **GIVEN** `skills/delivery/workflows/release-readiness.md` and `skills/delivery/workflows/auto.md`
- **WHEN** the text about NO-GO reasons is read
- **THEN** it says a needs-validation item is not a finding, not a comment blocker, and not cleared by risk acceptance or `continuous-delivery: yes`, and that auto asks the operator rather than running address-comments for it

#### Scenario: The brief lists an open item in plain language
- **GIVEN** an open item with the id `NV-0a1b2c3d`
- **WHEN** the brief is written from the template
- **THEN** the item appears under `### Facts to confirm before merging` with the id, the missing fact, and the owner check, and not under `### Must fix before merging`

### Requirement: Auto routes an open needs-validation item to the operator in code
`noGoNext` in `factory/scripts/next-action.ts` SHALL accept a fourth value, `acknowledgement`, in its type and in its schema, which means the only thing keeping release readiness NO-GO is an open needs-validation item. For a status of `[no-go <x>]` with `noGoNext` of `acknowledgement`, `nextAction` SHALL return a stopped result whose plain reason says the operator needs to acknowledge a fact to confirm before merging, and SHALL NOT return an address-comments action or a wait. The values `address`, `wait`, and `risk-acceptance`, and the stop for a missing classification, SHALL behave as before. An open item together with a code or comment blocker SHALL be classified `address` until the blockers are cleared, and `acknowledgement` once the item is the only reason left, so a code fix is never skipped and an item is never sent to the fix loop. `skills/delivery/workflows/auto.md` SHALL tell the conductor to choose `acknowledgement` from exit 1 of `NEEDS_VALIDATION_CHECK_INVOCATION` when no other blocker remains, and the list of reasons auto asks the operator about SHALL name acknowledging a fact to confirm.

#### Scenario: An open item stops auto with a plain reason
- **GIVEN** the status `[no-go !840]` and `noGoNext` of `acknowledgement`
- **WHEN** `nextAction` is called
- **THEN** the result is stopped, its reason names acknowledging a fact before merging, and it is not an address action

#### Scenario: Existing no-go routes are unchanged
- **GIVEN** the status `[no-go !840]` with `noGoNext` of `address`, of `wait`, of `risk-acceptance`, and with no classification
- **WHEN** `nextAction` is called
- **THEN** each result is what it was before this change

#### Scenario: The schema accepts the new value and rejects an unknown one
- **GIVEN** the context object that `next-action.ts` reads on its command line, with `noGoNext` of `acknowledgement` and separately of `fix-later`
- **WHEN** the context is read
- **THEN** the first is accepted and the second is rejected

#### Scenario: An item beside a code blocker is fixed first
- **GIVEN** release readiness with one open needs-validation item and one unanswered comment
- **WHEN** the conductor classifies the NO-GO by the auto workflow
- **THEN** the classification is `address`, and after the comment is answered it is `acknowledgement`

#### Scenario: The auto workflow names the route
- **GIVEN** `skills/delivery/workflows/auto.md` and `NEEDS_VALIDATION_CHECK_INVOCATION`
- **WHEN** the `[no-go !N]` row and the list of reasons auto asks about are read
- **THEN** they name the command text from the source, say `acknowledgement` is chosen from its exit 1 when no other blocker remains, and say auto asks the operator and does not run address-comments for it

### Requirement: Only the coordinator records an acknowledgement and a worker reads no ledger
In an isolated auto worker, where `DELIVERY_WORKER_JOURNAL` is set, a worker SHALL NOT write an acknowledgement line and SHALL NOT read the shared run ledger, so the gate cannot be cleared from a journal and a worker cannot see a ledger it must not touch. A worker that reaches a needs-validation item SHALL run the command, SHALL treat every item as open, and SHALL stop with the item ids, the missing facts, and the owner checks in its result for the coordinator. The coordinator, which is the only writer of the run ledger, SHALL ask the operator, SHALL append the acknowledgement to the run ledger only on the operator's own words, and SHALL recompute the gate against the run ledger. The coordinator SHALL NOT copy a line that contains `acknowledged needs-validation` from a worker journal into the run ledger, and SHALL read the worker's open items from its result and its journal as evidence, never as an acknowledgement. `skills/delivery/SKILL.md`, `skills/delivery/workflows/delivery-ledger.md`, and `skills/delivery/workflows/auto.md` SHALL say so.

#### Scenario: A worker stops with the items and never acknowledges
- **GIVEN** an isolated worker whose release readiness finds one open needs-validation item
- **WHEN** the worker finishes its stage
- **THEN** the item is open for it, its result carries the id, the missing fact, and the owner check, and its journal holds no acknowledgement line

#### Scenario: The coordinator records the acknowledgement
- **GIVEN** a worker result with one open item, and the operator's words acknowledging it in the conversation with the coordinator
- **WHEN** the coordinator records the acknowledgement
- **THEN** the line is appended to the run ledger and not to the journal, and the gate computed against the run ledger sees the item as acknowledged

#### Scenario: A line in a journal does not clear the gate
- **GIVEN** a worker journal that contains a well formed acknowledgement line, and a run ledger that does not
- **WHEN** the coordinator reconciles the journal and then runs the command against the run ledger
- **THEN** the item is open, and the reconciliation did not copy the line

#### Scenario: The worker rules are pinned in the skill pages
- **GIVEN** `NEEDS_VALIDATION_ACK_PHRASE` exported by `factory/scripts/needs-validation.ts` (new)
- **WHEN** `skills/delivery/SKILL.md`, `skills/delivery/workflows/delivery-ledger.md`, and `skills/delivery/workflows/auto.md` are read
- **THEN** each says a worker never writes the phrase and never reads the run ledger for this gate, and that only the coordinator records an acknowledgement
