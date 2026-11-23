# delivery-native-workflow

## Purpose

Defines the delivery lifecycle as a self-contained protocol whose terminology and artifacts do not depend on the framework from which it originated.

## Requirements

### Requirement: Delivery stages are self-contained
Each delivery stage SHALL define its own inputs, outputs, gates, and handoff artifacts using delivery-native terms.

#### Scenario: Stage is invoked on a new host
- **WHEN** a runtime invokes a delivery stage
- **THEN** the stage can be understood without documentation from another framework or product

### Requirement: Stage invocation is descriptor driven
The conductor SHALL invoke stages through runtime descriptors rather than product-specific slash commands or native command names.

#### Scenario: Runtime maps a stage to a native action
- **WHEN** the manifest declares an invocation for a stage
- **THEN** the conductor passes the normalized stage input to that invocation

### Requirement: Core artifacts are portable files
Run ledgers, plans, gate evidence, review evidence, routing observations, and recovery records SHALL use documented file schemas under the target repository.

#### Scenario: Conversation moves to another runtime
- **WHEN** a run resumes on a different conforming host
- **THEN** the new host reconstructs the lifecycle state from repository artifacts

### Requirement: Optional integrations do not change lifecycle safety
The absence or replacement of a forge, tracker, or review provider MUST NOT weaken approval gates, deterministic test gates, durable writes, or fail-closed transitions.

#### Scenario: Tracker provider is absent
- **WHEN** delivery runs without a tracker provider
- **THEN** it can use local work items while preserving the same lifecycle gates

#### Scenario: Forge provider is absent
- **WHEN** a stage requires a merge-request operation and no forge provider exists
- **THEN** delivery stops at that boundary and preserves the work already completed

### Requirement: Generic documentation makes bounded portability claims
The core documentation SHALL state the capability prerequisites for operation and MUST NOT claim support for hosts that cannot satisfy them.

#### Scenario: Host lacks subprocess execution
- **WHEN** an operator evaluates installation on a host without subprocess support
- **THEN** the documentation identifies which deterministic gates cannot run there

### Requirement: The conductor loads verb-specific detail on demand

The delivery conductor SHALL keep setup, the human decision brief, the command
cheat-sheet, and its own ledger writes in bundled files, and SHALL name for
each when to read it. Moving them SHALL NOT change any rule, and the conductor
SHALL stay within its lowered size ceiling.

#### Scenario: Help

- **GIVEN** `/delivery help`
- **WHEN** the conductor answers
- **THEN** it shows the cheat-sheet from `reference/help.md`

#### Scenario: An escalated choice

- **GIVEN** a choice the operator must make
- **WHEN** the conductor escalates it
- **THEN** it follows `reference/decision-brief.md`, giving options and trade-offs before any recommendation

### Requirement: Execute loads rarely used detail on demand

`/execute` SHALL read the routing-profiling procedure only when
`routingProfiling` is exactly `always`, and SHALL keep the mechanical-edit unit
list and the fast-model promotion rules in reference files it names. It SHALL
still never dispatch a catalogue fast model that is not live. No gate SHALL
change.

#### Scenario: Profiling off

- **GIVEN** `routingProfiling` is `off`
- **WHEN** execute dispatches the implementer and the holdout reviewer
- **THEN** it does not read `factory/reference/routing-profiling.md`

#### Scenario: Profiling always

- **GIVEN** `routingProfiling` is `always`
- **WHEN** execute reaches the implementer
- **THEN** it follows the Implementation section of `factory/reference/routing-profiling.md`

### Requirement: The operator can walk through a change before merging it

`/delivery walkthrough <iid>` SHALL ask the operator between three and five
questions about the change at its pinned head, one per message, each grounded
in a file it cites. It SHALL NOT give an answer before the operator answers,
except when they ask to be told. A wrong or vague answer SHALL get a narrower
question, and after two of those an explanation and one re-ask from another
angle.

#### Scenario: Wrong answer

- **WHEN** the operator answers a question wrongly
- **THEN** the next message asks a narrower question that exposes the contradiction, and gives no answer

### Requirement: A walkthrough is recorded and never a gate

The walkthrough SHALL record each question's topic, cited file, kind, outcome,
and hints under `.review/mr-<ref>/<head>/walkthrough.json`, and SHALL write
nothing else. Release readiness SHALL show that record's summary for the same
head, or suggest the walkthrough when none exists, and SHALL NOT change GO or
NO-GO because of it.

#### Scenario: Nothing explained

- **GIVEN** a walkthrough where the operator explained no question
- **WHEN** release readiness writes its brief
- **THEN** it lists those topics as worth reading before merging and keeps the verdict it reached without them
