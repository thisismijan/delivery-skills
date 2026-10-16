# Spec Delta

## Purpose

Distinguishes a live execute run from a crash before a merge request exists, so resume neither waits forever nor restarts blindly.

## ADDED Requirements

### Requirement: A matching open merge request continues to review

When the reconciled status is `[executing]` and a matching open merge request exists for the ticket, delivery SHALL record that merge request iid and proceed to review. It MUST NOT keep waiting for a build that has already opened the merge request.

#### Scenario: Matching open merge request
- **WHEN** delivery resumes a ticket whose status is `[executing]` and a matching open merge request exists
- **THEN** it records that merge request iid
- **AND** the selected action is review

### Requirement: No active owner and no merge request is an interrupted stop

When the reconciled status is `[executing]`, there is no active owner, and there is no merge request, delivery SHALL record an interrupted stop and offer the safe execute-resume command. A bare-key resume MUST NOT start execute. Typing execute remains the approval to build.

#### Scenario: Interrupted execute with no owner and no merge request
- **WHEN** delivery resumes a ticket whose status is `[executing]`, there is no active owner, and there is no merge request
- **THEN** it records an interrupted stop
- **AND** it offers `/delivery execute <KEY>` as the next command
- **AND** it does not run execute in the same resume step

#### Scenario: Typing execute remains the build approval
- **WHEN** the operator types execute for a ticket whose status is `[executing]`, there is no active owner, and there is no merge request
- **THEN** execute runs as the approved resume
- **AND** that typing is still the approval to build

### Requirement: Unattributable evidence escalates rather than guessing

When branch, gate, or dirty-worktree evidence is stale or conflicting and cannot be attributed to this execute run, delivery SHALL escalate. It MUST NOT discard that evidence and MUST NOT guess which parts belong to this run.

#### Scenario: Unattributable dirty worktree
- **WHEN** delivery resumes a ticket whose status is `[executing]` and the worktree is dirty in a way that cannot be attributed to this run
- **THEN** delivery escalates
- **AND** it does not discard the dirty files
- **AND** it does not guess whether they belong to this run

#### Scenario: Unattributable stale or conflicting branch
- **WHEN** delivery resumes a ticket whose status is `[executing]` and the branch is stale or conflicting in a way that cannot be attributed to this run
- **THEN** delivery escalates rather than continuing or restarting

#### Scenario: Unattributable stale or conflicting gate evidence
- **WHEN** delivery resumes a ticket whose status is `[executing]` and gate evidence is stale or conflicting in a way that cannot be attributed to this run
- **THEN** delivery escalates rather than reusing or discarding that evidence

### Requirement: A live owner without a merge request still waits

When the reconciled status is `[executing]`, an owner is still active, and there is no merge request, delivery SHALL wait for that live build. It MUST NOT treat the run as interrupted and MUST NOT start a second execute.

#### Scenario: Live execute still running
- **WHEN** delivery resumes a ticket whose status is `[executing]`, an owner is still active, and there is no merge request
- **THEN** it waits
- **AND** it does not record an interrupted stop
- **AND** it does not run execute

### Requirement: A confirmed failed stage is never retried automatically

An interrupted execute recovery MUST NOT retry a stage that has already been recorded as failed. Waiting for a live build, or offering execute after an interrupted stop, is not a retry of a failed stage.

#### Scenario: Failed stage stays stopped
- **WHEN** the reconciled status is a confirmed failed stop and delivery resumes
- **THEN** it does not retry that stage
