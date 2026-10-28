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

The max correctness review SHALL run no review-lens subagents when the measured diff has no reviewable code, the classification is complete, the change is reversible, and it touches none of Data, Contract, Config, Auth, or Infra. It SHALL run the correctness/security and
tests/specification lenses only when the pinned diff touches at most two files,
has fewer than 50 changed lines, is reversible, and touches none of Data,
Contract, Config, Auth, or Infra. Every other change SHALL run all four lenses.
A deterministic helper SHALL enforce the boundaries and reject malformed input.

#### Scenario: No reviewable code skips the lenses
- **WHEN** the measured diff has no reviewable code, classification is complete, the change is reversible, and it touches none of the excluded surfaces
- **THEN** no review-lens subagent is dispatched

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

### Requirement: Resolved and empty comments do not start the comment-assessor

When gather-and-scope finds a resolved discussion, a resolved note, or a comment whose body is empty after trim, `/address-comments` SHALL NOT send that comment to the comment-assessor. Remaining in-scope comments SHALL still dispatch exactly one assessor.

#### Scenario: A resolved discussion skips the assessor
- **WHEN** a discussion or note is already resolved
- **THEN** that comment is not passed to the comment-assessor

#### Scenario: An empty body is outdated without a classifier
- **WHEN** a remaining comment body is empty after trim
- **THEN** classification includes a scripted outdated verdict for that comment
- **AND** the comment-assessor does not receive it

### Requirement: An applied suggestion does not start the comment-assessor

When gather-and-scope finds a comment whose body is only a suggestion fence and whose suggested text is already present in the anchored file, `/address-comments` SHALL NOT send that comment to the comment-assessor. Remaining in-scope comments SHALL still dispatch exactly one assessor.

#### Scenario: An applied suggestion skips the assessor
- **WHEN** a remaining comment is only a suggestion already present in the file
- **THEN** that comment is not passed to the comment-assessor

#### Scenario: Unapplied suggestions still use the assessor
- **WHEN** the suggested text is not in the file, or the body has extra prose
- **THEN** that comment stays in scope for the comment-assessor

### Requirement: An acknowledgement-only comment does not start the comment-assessor

When gather-and-scope finds a comment whose body is only an acknowledgement such as LGTM, thanks, approved, or done, `/address-comments` SHALL NOT send that comment to the comment-assessor. Remaining in-scope comments SHALL still dispatch exactly one assessor.

#### Scenario: An acknowledgement skips the assessor
- **WHEN** a remaining comment body is only an acknowledgement
- **THEN** that comment is not passed to the comment-assessor

#### Scenario: Mixed acknowledgements still use the assessor
- **WHEN** the body contains an acknowledgement and other review text
- **THEN** that comment stays in scope for the comment-assessor

### Requirement: A mention-only comment does not start the comment-assessor

When gather-and-scope finds a comment whose body is only a mention, `/address-comments` SHALL NOT send that comment to the comment-assessor. Remaining in-scope comments SHALL still dispatch exactly one assessor.

#### Scenario: A mention-only body skips the assessor
- **WHEN** a remaining comment body is only a mention
- **THEN** that comment is not passed to the comment-assessor

#### Scenario: A mention with extra prose still uses the assessor
- **WHEN** the body contains a mention and other review text
- **THEN** that comment stays in scope for the comment-assessor

### Requirement: A URL-only comment does not start the comment-assessor

When gather-and-scope finds a comment whose body is only a URL, `/address-comments` SHALL NOT send that comment to the comment-assessor. Remaining in-scope comments SHALL still dispatch exactly one assessor.

#### Scenario: A URL-only body skips the assessor
- **WHEN** a remaining comment body is only a URL
- **THEN** that comment is not passed to the comment-assessor

#### Scenario: A URL with extra prose still uses the assessor
- **WHEN** the body contains a URL and other review text
- **THEN** that comment stays in scope for the comment-assessor

### Requirement: An emoji-only comment does not start the comment-assessor

When gather-and-scope finds a comment whose body is only emoji, `/address-comments` SHALL NOT send that comment to the comment-assessor. Remaining in-scope comments SHALL still dispatch exactly one assessor.

#### Scenario: An emoji-only body skips the assessor
- **WHEN** a remaining comment body is only emoji
- **THEN** that comment is not passed to the comment-assessor

#### Scenario: Emoji with extra prose still uses the assessor
- **WHEN** the body contains emoji and other review text
- **THEN** that comment stays in scope for the comment-assessor

### Requirement: An un-ranged suggestion does not start the comment implementer

When `/address-comments` actions a comment whose body is only an un-ranged suggestion fence on a new-side line inside the repository, it SHALL replace that line with `forge-comments.ts apply-suggestion` and SHALL NOT dispatch the implementer for that fix. A bug comment SHALL still get its red test first, and every gate and holdout SHALL still run. Any comment the helper cannot prove SHALL keep the implementer.

#### Scenario: An un-ranged suggestion is applied by script
- **WHEN** an action comment is only an un-ranged suggestion on a new-side line of a repository file
- **THEN** the anchored line is replaced with the suggested text, which may be more than one line
- **AND** no implementer is dispatched for that fix
- **AND** the green gate, lint, typecheck, and holdout still run

#### Scenario: Anything else keeps the implementer
- **WHEN** the comment has extra prose, a ranged suggestion, an old-side or missing anchor, or a path outside the repository
- **THEN** the helper reports `model` and writes nothing
- **AND** the implementer handles the fix as before

### Requirement: A structurally incomplete ticket does not start a ticket assessor

When `/draft` fetches a work item whose body fails `verify-ticket.ts`, it SHALL write an assessment from the verifier gaps and SHALL NOT dispatch the ticket-assessor. When the body passes, has no size warning, and Context, User stories, What to build, and Acceptance criteria contain no `?`, it SHALL write a `good` atomic assessment from those criteria and SHALL NOT dispatch the ticket-assessor. When the body passes with a size warning, it SHALL write a `too_large` assessment from that warning and SHALL NOT dispatch the ticket-assessor. A question mark without a size warning SHALL still dispatch exactly one ticket-assessor.

#### Scenario: Missing sections skip the assessor
- **WHEN** the work item body is missing a required section, Given/When/Then criterion, or checkbox
- **THEN** no ticket-assessor is dispatched
- **AND** assessment quality is `needs_clarification` with those gaps

#### Scenario: Too many stories or criteria request a split without a model
- **WHEN** the work item body has more than one user story or more than three acceptance criteria
- **THEN** no ticket-assessor is dispatched
- **AND** assessment `scopeFit` is `too_large`

#### Scenario: A complete ticket with no open questions skips the assessor
- **WHEN** the work item body passes `verify-ticket.ts` with no size warning and those sections contain no `?`
- **THEN** no ticket-assessor is dispatched
- **AND** assessment quality is `good` with the ticket's Given/When/Then criteria

#### Scenario: A size warning skips the assessor as too large
- **WHEN** the work item body passes `verify-ticket.ts` with a size warning
- **THEN** no ticket-assessor is dispatched
- **AND** assessment `scopeFit` is `too_large`

#### Scenario: A question still uses the assessor
- **WHEN** the work item body passes `verify-ticket.ts` with no size warning and Context, User stories, What to build, or Acceptance criteria contains `?`
- **THEN** exactly one ticket-assessor is dispatched

### Requirement: A blocked work item does not start draft assessors

When `/draft` fetches a work item whose recorded blocker list is not empty, it SHALL write a clarification assessment naming those blockers and SHALL NOT dispatch the ticket-assessor or the feasibility-analyst.

#### Scenario: Recorded blockers skip the assessor
- **WHEN** the fetched work item lists one or more blockers
- **THEN** no ticket-assessor is dispatched
- **AND** assessment quality is `needs_clarification` with those blocker references

#### Scenario: An unblocked complete ticket skips the assessor
- **WHEN** the blocker list is empty and the body is a complete ticket with no open questions
- **THEN** no ticket-assessor is dispatched

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

When `/draft` finds authentication, secrets, or a data migration named in What to build or Acceptance criteria, it SHALL write a `needs_human` feasibility verdict and SHALL NOT dispatch the feasibility-analyst. A complete ordinary ticket SHALL skip the analyst as feasible at medium complexity. A question mark SHALL still dispatch exactly one analyst.

#### Scenario: Named authentication skips the analyst
- **WHEN** What to build or Acceptance criteria names authentication, secrets, or a data migration
- **THEN** no feasibility-analyst is dispatched
- **AND** feasibility is `needs_human`

#### Scenario: Ordinary tickets still use the analyst
- **WHEN** those sections do not name authentication, secrets, or a data migration
- **AND** Context, User stories, What to build, or Acceptance criteria contains `?`
- **THEN** exactly one feasibility-analyst is dispatched

### Requirement: A complete ordinary ticket does not start a feasibility analyst

When `/draft` finds a work item whose body passes `verify-ticket.ts` with no size warning, whose Context, User stories, What to build, and Acceptance criteria contain no `?`, and whose What to build and Acceptance criteria do not name authentication, secrets, or a data migration, it SHALL write a `feasible` verdict at medium complexity and SHALL NOT dispatch the feasibility-analyst. A question mark SHALL still dispatch exactly one analyst.

#### Scenario: A complete ticket skips the analyst as feasible
- **WHEN** the body passes `verify-ticket.ts` with no size warning and those sections contain no `?`
- **AND** What to build and Acceptance criteria do not name authentication, secrets, or a data migration
- **THEN** no feasibility-analyst is dispatched
- **AND** feasibility is `yes` with medium complexity

#### Scenario: A question still uses the analyst
- **WHEN** the body passes `verify-ticket.ts` with no size warning and Context, User stories, What to build, or Acceptance criteria contains `?`
- **THEN** exactly one feasibility-analyst is dispatched

### Requirement: A question mark in a URL or inline code is not an open question

When `/draft` looks for an open question, it SHALL ignore `?` characters that appear only in a URL, in inline code, or in `?:`, `?.`, or `??`. A complete ticket whose only `?` characters are in those forms SHALL skip the ticket-assessor and the feasibility-analyst the same way as a ticket with no `?`. A `?` that remains in the scoped sections SHALL still dispatch those models.

#### Scenario: A URL query string skips the models
- **WHEN** the body is otherwise a complete ordinary ticket and the only `?` characters are in a URL or inline code
- **THEN** no ticket-assessor is dispatched
- **AND** no feasibility-analyst is dispatched

#### Scenario: Optional syntax skips the models
- **WHEN** the body is otherwise a complete ordinary ticket and the only `?` characters are in `?:`, `?.`, or `??`
- **THEN** no ticket-assessor is dispatched
- **AND** no feasibility-analyst is dispatched

#### Scenario: A real question still uses the models
- **WHEN** Context, User stories, What to build, or Acceptance criteria contains a `?` outside a URL, inline code, and those forms
- **THEN** the ticket-assessor and feasibility-analyst still run

### Requirement: A structurally valid ticket input does not start groom exploration

When `/groom` input already passes `verify-ticket.ts`, the command SHALL NOT dispatch the groom-explorer and SHALL NOT run the grilling loop. It SHALL classify the input as a single ticket and SHALL still require operator approval before writing drafts. Input that fails the verifier only because Out of scope or Blocked by is missing SHALL be filled as `None.` and skip exploration the same way. Any other verifier failure SHALL keep exploration and grilling.

#### Scenario: A valid ticket skips the explorer
- **WHEN** the resolved input passes `verify-ticket.ts`
- **THEN** no groom-explorer is dispatched
- **AND** no grilling questions are asked
- **AND** the operator still approves before any draft is written

#### Scenario: A raw idea still uses the explorer
- **WHEN** the resolved input fails `verify-ticket.ts`
- **AND** the failure is not only a missing Out of scope or Blocked by section
- **THEN** the read-only codebase explorer still runs before grilling

### Requirement: Housekeeping-only ticket gaps do not start groom exploration

When `/groom` input fails `verify-ticket.ts` only because Out of scope or Blocked by is missing, the command SHALL append those sections as `None.`, SHALL treat the result as a valid ticket, and SHALL NOT dispatch the groom-explorer or run grilling. Any other verifier failure SHALL keep exploration and grilling.

#### Scenario: Missing out of scope skips the explorer after a none fill
- **WHEN** the resolved input is otherwise a valid ticket and only Out of scope or Blocked by is missing
- **THEN** those sections are appended as `None.`
- **AND** no groom-explorer is dispatched
- **AND** no grilling questions are asked

#### Scenario: A missing context section still uses the explorer
- **WHEN** the resolved input is missing Context, User stories, What to build, or Acceptance criteria
- **THEN** the read-only codebase explorer still runs before grilling

### Requirement: An approved valid ticket input does not start a groom writer

When `/groom` skipped exploration because the input passed `verify-ticket.ts`, and the operator approved that same content without a rewrite, the command SHALL copy the verified source to the final draft path and SHALL NOT dispatch the groom-writer. A rewrite request, or input that failed the verifier, SHALL still dispatch the writer.

#### Scenario: Unchanged approval copies the source
- **WHEN** the input passed `verify-ticket.ts` and the operator approved that content without a rewrite
- **THEN** no groom-writer is dispatched
- **AND** the final draft is a verified copy of that source

#### Scenario: A rewrite still uses the writer
- **WHEN** the operator requests a rewrite, or the input failed `verify-ticket.ts`
- **THEN** the groom-writer still runs

### Requirement: A scripted apply at implement time does not start the implementer

When `/execute` reaches implementation and `apply-mechanical-edit.ts` reports `apply` is `script`, it SHALL NOT dispatch the implementer. It SHALL continue at the green gates. A unit that is not scripted SHALL still dispatch the implementer.

#### Scenario: Scripted apply skips the implementer at implement time
- **WHEN** step 7's `apply-mechanical-edit.ts` reports `apply` is `script`
- **THEN** no implementer is dispatched
- **AND** green, lint, typecheck, and holdout still run

#### Scenario: An unscripted implement step still uses the implementer
- **WHEN** the unit is `not-mechanical` or `apply` is `select-model`
- **THEN** the implementer still runs
