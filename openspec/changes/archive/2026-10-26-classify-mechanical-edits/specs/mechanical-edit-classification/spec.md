## Purpose

Classifies a bounded edit as mechanical or not from a structured payload, without asking the worker that would apply it.

## ADDED Requirements

### Requirement: Mechanical edits are structured units

A mechanical-edit unit SHALL name one operation (`rename`, `import-only`, or `format-only`), the identifiers or files it touches, and whether existing tests plus compile are the verification. Free-text findings, ticket prose, or a worker's claim SHALL NOT be treated as a complete unit.

#### Scenario: A rename unit is complete
- **WHEN** the payload names `rename`, a from-identifier, a to-identifier, and at least one file
- **THEN** classification may proceed

#### Scenario: Free text is not a unit
- **WHEN** the only input is a holdout finding string such as "rename the helper"
- **THEN** classification fails closed as incomplete, not mechanical

### Requirement: Classification is deterministic and fail-closed

A deterministic helper SHALL classify a complete unit as `mechanical` only when every mechanical condition holds. Incomplete, unknown, or unsafe input SHALL classify as `not-mechanical`. The applying worker SHALL NOT classify the unit.

#### Scenario: A local rename with strong verification is mechanical
- **WHEN** the unit is `rename`, reversible, local, known-pattern, strongly verified, and touches none of auth, migration, concurrency, or distributed-state
- **THEN** the helper returns `mechanical`

#### Scenario: A public-contract rename is not mechanical
- **WHEN** the unit's surfaces include a public contract
- **THEN** the helper returns `not-mechanical`

#### Scenario: Unknown operation fails closed
- **WHEN** the operation is missing or not one of the allowed values
- **THEN** classification fails closed rather than guessing

#### Scenario: The worker does not choose the tier
- **WHEN** an implementer or comment-fix worker is about to run
- **THEN** the command classifies the unit before dispatch and does not ask that worker whether the work is menial

### Requirement: Scripted apply is preferred for mechanical units

When a unit classifies as mechanical and the language can prove an identifier rename, import-only, or format-only patch without a model, the command SHALL apply that scripted path. A language model SHALL NOT be the first apply mechanism for those operations.

#### Scenario: A proven identifier rename uses a script
- **WHEN** a mechanical rename unit can be applied by a language-server or AST refactor
- **THEN** the command applies it without dispatching a model worker

#### Scenario: Script inapplicable keeps the standard worker
- **WHEN** a unit is mechanical but no scripted apply exists for that language
- **THEN** live dispatch stays on the current `select-model` worker until a later fast-model promotion

### Requirement: Unclassified work keeps today's worker

Execute and comment-fix SHALL record the classification. When the unit is `not-mechanical` or incomplete, live dispatch SHALL use the existing standard or frontier worker. This change SHALL NOT dispatch a fast catalogue model.

#### Scenario: Ordinary implement stays on the recorded complexity model
- **WHEN** execute implements a ticket with no mechanical-edit unit
- **THEN** the live worker is still the model `select-model` returns for implement

#### Scenario: A fast model is not dispatched
- **WHEN** a unit classifies as mechanical
- **THEN** no evaluation-only catalogue model is the live worker
