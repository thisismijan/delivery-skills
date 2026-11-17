# Spec Delta

## Purpose

Provides deterministic, provider-neutral work-item operations that delivery
can execute against local files or verified remote adapters.

## ADDED Requirements

### Requirement: Selected providers expose normalized operations
The system SHALL expose list, read, create, dependency-link, and note
operations through one normalized interface and SHALL return provider identity
with every result.

#### Scenario: Operation succeeds
- **WHEN** the selected provider completes a supported operation
- **THEN** delivery receives a validated normalized result independent of provider-specific fields

#### Scenario: Operation is unsupported
- **WHEN** the selected provider does not implement the requested operation
- **THEN** delivery stops with an exact provider setup remedy and preserves completed artifacts

### Requirement: Local files implement the complete interface
The local-files provider SHALL allocate stable references and support
idempotent list, read, create, dependency-link, and note operations without a
network service.

#### Scenario: Approved item is created
- **WHEN** delivery submits an approved draft without a reference
- **THEN** the provider allocates the next collision-free local reference and persists a readable item

#### Scenario: Audit note is repeated
- **WHEN** the same audit id and note body are submitted more than once
- **THEN** exactly one note remains on the item

### Requirement: Remote adapters use an executable protocol
A remote provider SHALL advertise an executable invocation that accepts a
named operation and JSON input and returns one validated JSON result.

#### Scenario: Adapter returns malformed output
- **WHEN** an executable adapter exits successfully but returns malformed or invalid JSON
- **THEN** delivery treats the operation as failed and does not invent a result

#### Scenario: Adapter process fails
- **WHEN** the executable adapter exits non-zero
- **THEN** delivery reports a sanitised provider failure without exposing credentials

### Requirement: Mutating work-item operations remain approval bounded
Create and dependency-link operations SHALL require explicit approved input,
and the interface SHALL NOT expose status-transition or delete operations.

#### Scenario: Unapproved create
- **WHEN** a caller requests creation without approved plan evidence
- **THEN** the operation is refused before any local or remote provider runs

#### Scenario: Status transition requested
- **WHEN** delivery would need to change work-item status
- **THEN** it leaves that action to the human operator
