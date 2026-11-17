## ADDED Requirements

### Requirement: A bug repeating an earlier round's assumption gets a premise check
Every bug the comment assessor classifies SHALL carry a kebab-case label for
the design assumption it breaks. Address-comments SHALL record each round with
`review-rounds.ts record`. When a bug's label appeared in an earlier round,
address-comments SHALL state the premise and run one discriminating
observation before any fix, and SHALL record the outcome with
`review-rounds.ts premise`. When a label repeats after its premise check, the
round SHALL stop for the operator.

#### Scenario: New assumption
- **WHEN** no bug in the round repeats an earlier round's label
- **THEN** `record` exits 0 and the round continues

#### Scenario: Repeated assumption
- **WHEN** a bug's label appeared in any earlier round
- **THEN** `record` exits 3 and no fix for that comment is written before the premise check is recorded

#### Scenario: Repeated after a premise check
- **WHEN** a label repeats in a later round after its premise check
- **THEN** `record` exits 1 and the round stops with zero commits

#### Scenario: Re-entry
- **WHEN** the same head is recorded again
- **THEN** that round is replaced and the round count does not grow

#### Scenario: Missing label
- **WHEN** a bug has no assumption label, or a non-bug has one
- **THEN** the classification verdict is refused

### Requirement: Formatting and spec edits go in the fix commit
Each actioned comment SHALL produce one fix commit, after a test-only commit
for a bug. The repository's formatter SHALL run on the changed files before
each commit, and a spec update for the fix SHALL be in the same commit. A lint
failure that is only formatting SHALL amend the unpushed commit instead of
adding a formatting-only commit.

#### Scenario: Fix that changes specified behaviour
- **WHEN** a fix changes behaviour the OpenSpec change describes
- **THEN** the spec update is in the fix commit, not a commit of its own

#### Scenario: Lint fails only on formatting
- **WHEN** lint fails only because the fix commit is not formatted
- **THEN** the formatter runs, the unpushed commit is amended, and the gates run again
