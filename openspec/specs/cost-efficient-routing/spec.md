# cost-efficient-routing

## Purpose

Keeps diagnostic routing profiling off unless an operator is collecting evidence, and bounds review spend without weakening live model selection or quality gates.

## Requirements

### Requirement: Diagnostic routing profiling is opt-in

The factory SHALL default diagnostic routing profiling to off. It SHALL run a
profile controller only when the validated profiling mode is `always`. Unknown
profiling modes SHALL fail configuration parsing.

#### Scenario: An ordinary run skips profiling
- **WHEN** no profiling setting is supplied
- **THEN** the factory runs no diagnostic profile controller

#### Scenario: Evidence collection is explicitly enabled
- **WHEN** the profiling mode is `always`
- **THEN** the factory runs the profile controller and records the existing
  shadow-routing evidence

#### Scenario: An unknown mode fails closed
- **WHEN** the profiling setting is neither `off` nor `always`
- **THEN** configuration parsing fails before workflow dispatch

### Requirement: Profiling does not control live delivery

Enabling or disabling diagnostic profiling SHALL NOT change the model selected
for live work, the work dispatched to authors, implementers, or assessors, the
frontier holdout reviewer, or any quality gate.

#### Scenario: Profiling is off during implementation
- **WHEN** implementation runs with profiling off
- **THEN** the same live implementation worker and all quality gates run
  without a profile-controller call

#### Scenario: Profiling is off during holdout review
- **WHEN** a holdout review runs with profiling off
- **THEN** the frontier holdout reviewer still runs with the same evidence and
  verdict routing

#### Scenario: Profiling is enabled
- **WHEN** a task runs with profiling set to `always`
- **THEN** its shadow recommendation is recorded but never dispatched for that
  task

### Requirement: Review fan-out is proportional to demonstrated risk

The max correctness review SHALL run the correctness/security and
tests/specification lenses only when the pinned diff touches at most two files,
has fewer than 50 changed lines, is reversible, and touches none of Data,
Contract, Config, Auth, or Infra. Every other change SHALL run all four lenses.
A deterministic helper SHALL enforce the boundaries and reject malformed input.

#### Scenario: Small reversible change uses the essential lenses
- **WHEN** a two-file, 40-line, two-way change touches none of the excluded
  surfaces
- **THEN** correctness/security and tests/specification run on the standard
  tier

#### Scenario: Risky change retains the full review
- **WHEN** a change touches auth, migrations, a public contract, configuration,
  infrastructure, or a one-way operation
- **THEN** all four review lenses run

#### Scenario: Unknown classification retains the full review
- **WHEN** any small-change condition cannot be proved from the pinned diff
- **THEN** all four review lenses run

### Requirement: Release-readiness lens candidates use the standard tier

Every Stage 4 readiness lens worker SHALL use the exact resolved standard-tier model. The main conversation SHALL independently synthesise the GO or NO-GO verdict from those findings.

#### Scenario: A readiness lens reports a finding
- **WHEN** a rollback, compatibility, security, or operability lens returns a finding
- **THEN** the standard-tier model identity is recorded for that worker
- **AND** the main conversation decides whether it blocks release

### Requirement: Review-lens candidates use the standard tier

Every max-review lens worker SHALL use the exact resolved standard-tier model.
The main conversation SHALL independently adjudicate every candidate finding
against the pinned code before it affects the verdict.

#### Scenario: A lens reports a candidate finding
- **WHEN** any small or full-review lens returns a candidate
- **THEN** the standard-tier model identity is recorded for that worker
- **AND** the main conversation verifies the candidate against pinned evidence

### Requirement: Unchanged code is not sent through duplicate holdout review

The address-comments workflow SHALL compare the branch head before and after
comment processing. When the head is unchanged and no pending re-review marker
existed on entry, it SHALL skip cumulative gates and frontier holdout re-review,
leave the merge request draft, and require Stage 3 dual review. A changed head
or existing pending marker SHALL retain cumulative gates and fresh holdout.

#### Scenario: Replies do not change the head
- **WHEN** comments are answered or disputed without a commit and no pending
  re-review exists
- **THEN** duplicate cumulative gates and holdout re-review are skipped
- **AND** Stage 3 dual review remains required

#### Scenario: A fix changes the head
- **WHEN** addressing a comment creates a commit
- **THEN** cumulative gates and fresh frontier holdout re-review still run

#### Scenario: A pending review resumes
- **WHEN** a pending re-review marker exists on entry even though the current
  round creates no commit
- **THEN** cumulative gates and fresh frontier holdout re-review still run

### Requirement: An empty in-scope list does not start a comment assessor

When gather-and-scope returns no in-scope comments, `/address-comments` SHALL write an empty classification verdict and SHALL NOT dispatch the comment-assessor. A non-empty in-scope list SHALL still dispatch exactly one assessor.

#### Scenario: Zero in-scope comments skip the assessor
- **WHEN** every discussion is already handled or every remaining comment is scripted outdated
- **THEN** no comment-assessor is dispatched and classification is an empty array plus any scripted outdated verdicts

#### Scenario: Remaining comments still use one assessor
- **WHEN** at least one in-scope comment remains after scoping
- **THEN** exactly one comment-assessor is dispatched with only those comments
