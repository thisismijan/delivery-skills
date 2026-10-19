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
