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

### Requirement: A structurally incomplete ticket does not start a ticket assessor

When `/draft` fetches a work item whose body fails `verify-ticket.ts`, it SHALL write an assessment from the verifier gaps and SHALL NOT dispatch the ticket-assessor. A body that passes structural verification SHALL still dispatch exactly one ticket-assessor.

#### Scenario: Missing sections skip the assessor
- **WHEN** the work item body is missing a required section, Given/When/Then criterion, or checkbox
- **THEN** no ticket-assessor is dispatched
- **AND** assessment quality is `needs_clarification` with those gaps

#### Scenario: Too many stories or criteria request a split without a model
- **WHEN** the work item body has more than one user story or more than three acceptance criteria
- **THEN** no ticket-assessor is dispatched
- **AND** assessment `scopeFit` is `too_large`

#### Scenario: A structurally valid ticket still uses the assessor
- **WHEN** the work item body passes `verify-ticket.ts`
- **THEN** exactly one ticket-assessor is dispatched

### Requirement: A blocked work item does not start draft assessors

When `/draft` fetches a work item whose recorded blocker list is not empty, it SHALL write a clarification assessment naming those blockers and SHALL NOT dispatch the ticket-assessor or the feasibility-analyst.

#### Scenario: Recorded blockers skip the assessor
- **WHEN** the fetched work item lists one or more blockers
- **THEN** no ticket-assessor is dispatched
- **AND** assessment quality is `needs_clarification` with those blocker references

#### Scenario: An unblocked structurally valid ticket still uses the assessor
- **WHEN** the blocker list is empty and the body passes structural verification
- **THEN** exactly one ticket-assessor is dispatched

### Requirement: A scripted mechanical-edit unit does not start execute workers

When `/execute` applies a mechanical-edit unit and `apply` is `script`, it SHALL NOT dispatch the test-writer or the implementer, and SHALL NOT run a red gate. It SHALL still run green, lint, and typecheck, then holdout. A unit that is not scripted SHALL keep tests-first and the implementer.

#### Scenario: Scripted apply skips the test-writer
- **WHEN** `apply-mechanical-edit.ts` reports `apply` is `script`
- **THEN** no test-writer is dispatched
- **AND** no red gate runs
- **AND** no implementer is dispatched
- **AND** green, lint, typecheck, and holdout still run

#### Scenario: An unscripted unit keeps tests-first
- **WHEN** the unit is `not-mechanical` or `apply` is `select-model`
- **THEN** the test-writer, red gate, and implementer still run

### Requirement: Named safety-sensitive work does not start a feasibility analyst

When `/draft` finds authentication, secrets, or a data migration named in What to build or Acceptance criteria, it SHALL write a `needs_human` feasibility verdict and SHALL NOT dispatch the feasibility-analyst. A ticket that does not name those topics SHALL still dispatch exactly one analyst.

#### Scenario: Named authentication skips the analyst
- **WHEN** What to build or Acceptance criteria names authentication, secrets, or a data migration
- **THEN** no feasibility-analyst is dispatched
- **AND** feasibility is `needs_human`

#### Scenario: Ordinary tickets still use the analyst
- **WHEN** those sections do not name authentication, secrets, or a data migration
- **THEN** exactly one feasibility-analyst is dispatched

### Requirement: A structurally valid ticket input does not start groom exploration

When `/groom` input already passes `verify-ticket.ts`, the command SHALL NOT dispatch the groom-explorer and SHALL NOT run the grilling loop. It SHALL classify the input as a single ticket and SHALL still require operator approval before writing drafts. Input that fails the verifier SHALL keep exploration and grilling.

#### Scenario: A valid ticket skips the explorer
- **WHEN** the resolved input passes `verify-ticket.ts`
- **THEN** no groom-explorer is dispatched
- **AND** no grilling questions are asked
- **AND** the operator still approves before any draft is written

#### Scenario: A raw idea still uses the explorer
- **WHEN** the resolved input fails `verify-ticket.ts`
- **THEN** the read-only codebase explorer still runs before grilling
