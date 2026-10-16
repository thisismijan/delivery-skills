## ADDED Requirements

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
