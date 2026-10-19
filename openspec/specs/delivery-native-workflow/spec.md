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
