# Spec Delta

## Purpose

Makes the dual Stage 3 review the only authority that can mark the current merge request head ready to leave draft.

## ADDED Requirements

### Requirement: Matching dual-review artifacts may undraft the current head
A merge request SHALL be marked ready only when both a max-pass artifact and an approach-pass artifact exist for that merge request, their markers match the current head, and neither artifact records a blocker.

#### Scenario: Validated dual pass with no blockers
- **WHEN** matching max-pass and approach-pass artifacts exist for the current merge request and head, and neither records a blocker
- **THEN** the review decision is ready
- **AND** the merge request may be undrafted

### Requirement: Address-comments holdout does not mark a new head ready
After comments are addressed on a new head, a satisfied cumulative holdout SHALL leave the merge request draft. Status SHALL become `[addressed !N]`. Holdout SHALL NOT undraft the merge request and SHALL NOT write a ready review verdict.

#### Scenario: Holdout approve after addressing comments
- **WHEN** comments are addressed on a new head and the cumulative holdout returns approve
- **THEN** the merge request remains draft
- **AND** status becomes `[addressed !N]`

### Requirement: Incomplete review evidence keeps the merge request draft
Malformed, stale, missing, or blocking max-pass or approach-pass evidence SHALL keep the merge request draft. A conductor-written review row MUST NOT undraft the current head or stand in for those artifacts.

#### Scenario: Missing max-pass artifact
- **WHEN** the approach-pass artifact matches the current head and the max-pass artifact is missing
- **THEN** the review decision is stay-draft
- **AND** the merge request remains draft

#### Scenario: Missing approach-pass artifact
- **WHEN** the max-pass artifact matches the current head and the approach-pass artifact is missing
- **THEN** the review decision is stay-draft
- **AND** the merge request remains draft

#### Scenario: Stale artifact head
- **WHEN** either artifact's marker names a different head than the current merge request head
- **THEN** the review decision is stay-draft
- **AND** the merge request remains draft

#### Scenario: Malformed artifact marker
- **WHEN** either artifact is present but its marker cannot be validated
- **THEN** the review decision is stay-draft
- **AND** the merge request remains draft

#### Scenario: Blocking findings
- **WHEN** a matching artifact records a blocker
- **THEN** the review decision is stay-draft
- **AND** the merge request remains draft

#### Scenario: Conductor-written review row is not enough
- **WHEN** the ledger has a ready review row and the dual-review artifacts are missing, stale, malformed, or blocking
- **THEN** the review decision is stay-draft
- **AND** the merge request remains draft
- **AND** release readiness does not proceed as if Stage 3 had passed

### Requirement: Addressed status resumes at dual review
A ticket whose status is `[addressed !N]` SHALL take review as its next step. Resume MUST NOT select address comments for that status.

#### Scenario: Bare key at addressed selects review
- **WHEN** `/delivery <KEY>` runs and the reconciled status is `[addressed !N]`
- **THEN** the selected action is review
- **AND** it is not address comments
