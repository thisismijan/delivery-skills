# Spec Delta

## Purpose

Provides portable, deterministic change inspection and review publication
across forge products while preserving human-owned delivery boundaries.

## ADDED Requirements

### Requirement: Forge changes have normalized identities and metadata
The system SHALL expose provider-neutral find and read operations whose results
include provider identity, opaque change reference, state, branches, revisions,
title, description, author, URL, and available pipeline evidence.

#### Scenario: Change is found by source branch
- **WHEN** a caller finds open changes for a source branch
- **THEN** the provider returns validated normalized change summaries without product-specific fields

#### Scenario: Adapter returns an invalid change
- **WHEN** an adapter exits successfully with malformed or incomplete output
- **THEN** the operation fails closed and does not invent metadata

### Requirement: Review evidence is available through normalized views
The system SHALL expose changed-file summaries, unified diff, commits,
discussions, valid inline anchors, and revision references through normalized
operations.

#### Scenario: Review context is complete
- **WHEN** a review requests each evidence view for a change
- **THEN** each result is schema-validated and bound to the requested change and head revision

#### Scenario: Diff is truncated
- **WHEN** the forge reports that a diff is incomplete or overflowed
- **THEN** the provider refuses the diff instead of returning partial review evidence

### Requirement: Mutating forge operations are explicit and approval bounded
Draft creation, draft-state changes, notes, inline notes, and discussion replies
SHALL require explicit approved input and SHALL return normalized publication
receipts.

#### Scenario: Mutation lacks approval
- **WHEN** a caller requests a forge mutation without `approved: true`
- **THEN** the command refuses the request before invoking any adapter

#### Scenario: Note body is unsafe
- **WHEN** a publication body is outside the repository review directory or resembles a secret
- **THEN** the command refuses publication before invoking any adapter

### Requirement: Forge adapters use a shell-free executable protocol
Available forge and review capabilities SHALL identify a provider and an
absolute executable that accepts a named operation, a versioned JSON request on
stdin, and returns versioned normalized JSON on stdout.

#### Scenario: Adapter process fails
- **WHEN** an adapter exits non-zero
- **THEN** the command reports a sanitized provider failure without exposing stderr or credentials

#### Scenario: Capability providers disagree
- **WHEN** review publication and change inspection advertise different provider identities for one operation
- **THEN** delivery stops with a provider configuration remedy

### Requirement: Destructive lifecycle actions remain human-owned
The normalized forge interface SHALL NOT expose merge, close, delete, approve,
or discussion-resolution operations.

#### Scenario: Delivery reaches merge readiness
- **WHEN** all automated review and readiness gates pass
- **THEN** delivery reports readiness and leaves merge or close actions to a human
