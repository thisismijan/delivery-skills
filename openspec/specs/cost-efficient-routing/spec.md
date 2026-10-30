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

### Requirement: Release-readiness lens fan-out is proportional to demonstrated risk

Stage 4 SHALL dispatch no readiness-lens subagents when `review-fanout.ts readiness` returns `empty` or `small`. An empty measured diff SHALL also skip the rollback lens in the main conversation. A small reversible change SHALL still run the rollback lens in the main conversation. Every other change SHALL run the lenses the classification turned on. The helper SHALL refuse malformed input.

#### Scenario: No reviewable code skips readiness lenses
- **WHEN** the measured diff has no reviewable code, classification is complete, the change is reversible, and it touches none of Data, Contract, Config, Auth, or Infra
- **THEN** no readiness-lens subagent is dispatched
- **AND** the main conversation does not run the rollback lens itself

#### Scenario: Small reversible change skips readiness subagents
- **WHEN** a two-file, 40-line, two-way change touches none of the excluded surfaces
- **THEN** no readiness-lens subagent is dispatched
- **AND** the main conversation runs the rollback lens itself

#### Scenario: Risky change retains the classified lenses
- **WHEN** a change touches auth, migrations, a public contract, configuration, infrastructure, or a one-way operation
- **THEN** the helper returns `full`
- **AND** the classified readiness lenses still run

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

When gather-and-scope finds a comment whose body is only acknowledgements such as LGTM, thanks, approved, or done, `/address-comments` SHALL NOT send that comment to the comment-assessor. Remaining in-scope comments SHALL still dispatch exactly one assessor.

#### Scenario: An acknowledgement skips the assessor
- **WHEN** a remaining comment body is only acknowledgements
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

### Requirement: A suggestion fence does not start the comment implementer

When `/address-comments` actions a comment whose body is only a suggestion fence on a new-side line inside the repository, it SHALL apply that span with `forge-comments.ts apply-suggestion` and SHALL NOT dispatch the implementer for that fix. An optional `:-N+M` header SHALL replace from N lines before the anchor through M lines after it. A bug comment SHALL still get its red test first, and every gate and holdout SHALL still run. Any comment the helper cannot prove SHALL keep the implementer.

#### Scenario: A suggestion fence is applied by script
- **WHEN** an action comment is only a suggestion fence on a new-side line of a repository file
- **THEN** the named span is replaced with the suggested text
- **AND** no implementer is dispatched for that fix
- **AND** the green gate, lint, typecheck, and holdout still run

#### Scenario: Anything else keeps the implementer
- **WHEN** the comment has extra prose, a range that leaves the file, an old-side or missing anchor, or a path outside the repository
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

#### Scenario: A JavaScript rename is applied by script
- **WHEN** the listed files are JavaScript and the rename is proven
- **THEN** `apply-mechanical-edit.ts` reports `apply` is `script`
- **AND** no test-writer or implementer is dispatched

#### Scenario: A unique Python local is applied by script
- **WHEN** the listed files hold one Python parameter or local binding and no attribute, exec, or eval use of that name
- **THEN** `apply-mechanical-edit.ts` reports `apply` is `script`

#### Scenario: A unique Java field is applied by script
- **WHEN** the listed files hold one Java field and no method or type of that name
- **THEN** `apply-mechanical-edit.ts` reports `apply` is `script`

#### Scenario: A Java type rename moves the matching file
- **WHEN** a unique Java type rename is proven and a listed file is named `from.java`
- **THEN** `apply-mechanical-edit.ts` writes `to.java` and removes `from.java`
- **AND** `apply` is `script`

#### Scenario: A unique TypeScript missing import is applied by script
- **WHEN** import-only runs and the language service offers exactly one missing-import fix in listed files
- **THEN** `apply-mechanical-edit.ts` reports `apply` is `script`

#### Scenario: A unique Python missing import is applied by script
- **WHEN** import-only runs and exactly one repository Python file exports a used unbound name
- **THEN** `apply-mechanical-edit.ts` reports `apply` is `script`
- **AND** the listed file gains that import

#### Scenario: An ambiguous Python missing import is not added
- **WHEN** import-only runs and two repository Python files export the same used name
- **THEN** `apply` is `script`
- **AND** the listed file does not gain that import

#### Scenario: A unique Java missing import is applied by script
- **WHEN** import-only runs and exactly one public Java type matches a used simple name
- **THEN** `apply-mechanical-edit.ts` reports `apply` is `script`
- **AND** the listed file gains that import

#### Scenario: An ambiguous Java missing import is not added
- **WHEN** import-only runs and two public Java types share the used simple name
- **THEN** `apply` is `script`
- **AND** the listed file does not gain that import

#### Scenario: A repo formatter that changes names stays unscripted
- **WHEN** format-only invokes a repo Prettier, Ruff, or google-java-format binary
- **AND** the result would change names or literals
- **THEN** `apply` is `select-model`
- **AND** the listed files are unchanged

### Requirement: Named safety-sensitive work does not start a feasibility analyst

When `/draft` finds authentication, authorization, secrets, credentials, OAuth, OIDC, JWT, or a data, schema, or database migration named in What to build or Acceptance criteria, it SHALL write a `needs_human` feasibility verdict and SHALL NOT dispatch the feasibility-analyst. A complete ordinary ticket SHALL skip the analyst as feasible at medium complexity. A question mark SHALL still dispatch exactly one analyst.

#### Scenario: Named authentication skips the analyst
- **WHEN** What to build or Acceptance criteria names authentication, authorization, secrets, credentials, OAuth, OIDC, JWT, or a data, schema, or database migration
- **THEN** no feasibility-analyst is dispatched
- **AND** feasibility is `needs_human`

#### Scenario: Ordinary tickets still use the analyst
- **WHEN** those sections do not name authentication, authorization, secrets, credentials, OAuth, OIDC, JWT, or a data, schema, or database migration
- **AND** Context, User stories, What to build, or Acceptance criteria contains `?`
- **THEN** exactly one feasibility-analyst is dispatched

### Requirement: A complete ordinary ticket does not start a feasibility analyst

When `/draft` finds a work item whose body passes `verify-ticket.ts` with no size warning, whose Context, User stories, What to build, and Acceptance criteria contain no `?`, and whose What to build and Acceptance criteria do not name authentication, authorization, secrets, credentials, OAuth, OIDC, JWT, or a data, schema, or database migration, it SHALL write a `feasible` verdict at medium complexity and SHALL NOT dispatch the feasibility-analyst. A question mark SHALL still dispatch exactly one analyst.

#### Scenario: A complete ticket skips the analyst as feasible
- **WHEN** the body passes `verify-ticket.ts` with no size warning and those sections contain no `?`
- **AND** What to build and Acceptance criteria do not name authentication, authorization, secrets, credentials, OAuth, OIDC, JWT, or a data, schema, or database migration
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

### Requirement: A scripted skip is recorded as an avoided worker

When a factory command does not dispatch a named worker because a script
already proved the outcome, it SHALL persist a skip record naming that
worker and a human reason. The record SHALL NOT include token, cost, or
wall-time estimates. Persistence SHALL refuse an unknown worker name or a
duplicate skip id for the same run.

#### Scenario: A mechanical apply records the avoided execute workers
- **WHEN** `apply-mechanical-edit.ts` reports `apply` is `script`
- **THEN** skip records name `test-writer` and `implementer`
- **AND** those records contain no token or cost fields

#### Scenario: An unknown worker is refused
- **WHEN** persist is given a worker name outside the closed list
- **THEN** it writes nothing and exits non-zero

### Requirement: The run scorecard counts avoided workers without pricing them

The run scorecard SHALL count persisted skip records for that run and
SHALL print the avoided-worker total beside measured usage. It SHALL
state that token savings are not estimated. A run that has skip records
and no routing observations SHALL still produce a scorecard.

#### Scenario: Skips appear on the scorecard
- **WHEN** a run has two skip records and measured usage from workers that ran
- **THEN** the scorecard reports two workers avoided
- **AND** the text does not invent tokens saved

#### Scenario: A skip-only run still scores
- **WHEN** a run has skip records and no routing observations
- **THEN** the scorecard still prints the avoided-worker count

### Requirement: Skip recording does not depend on diagnostic profiling

Skip persist and the avoided-worker scorecard line SHALL run when
`routingProfiling` is `off`. Turning profiling `always` SHALL NOT change
which workers are skipped.

#### Scenario: Profiling off still records skips
- **WHEN** a scripted skip fires and `routingProfiling` is `off`
- **THEN** the skip record is still persisted
- **AND** the scorecard still counts it

### Requirement: The unscripted mechanical pack matches remaining worker units

The representative unscripted mechanical pack SHALL include units that
`apply-mechanical-edit.ts` cannot prove, including a Python attribute of
the same name, `exec` or `eval`, `serialVersionUID`, and a repo formatter
that changes names or literals. It SHALL NOT include units whose apply
result is `script`.

#### Scenario: Remaining refusals are in the pack
- **WHEN** the unscripted pack is listed
- **THEN** it includes a Python attribute rename, an exec use, a
  `serialVersionUID` field, and a formatter that changes names

#### Scenario: Scripted missing imports stay out
- **WHEN** the unscripted pack is listed
- **THEN** it does not include a unique Python or Java missing import

### Requirement: Task lists are generated from spec scenarios

When `/draft` has written the delta specs, it SHALL generate `tasks.md`
with `generate-tasks.ts` and SHALL NOT ask a model to invent the task
list. The file SHALL contain one test task per `Scenario` heading, then
an implementation task. Missing specs or a spec with no scenarios SHALL
fail closed and write nothing.

#### Scenario: Scenarios become tests-first tasks
- **WHEN** the change specs contain two scenarios
- **THEN** `tasks.md` lists two test tasks before implementation
- **AND** no model is asked to write the task list

#### Scenario: A spec without scenarios is refused
- **WHEN** the specs directory has no `Scenario` headings
- **THEN** `generate-tasks.ts` exits non-zero
- **AND** `tasks.md` is not written

### Requirement: Claude Code does not spend tokens on agent status summaries

When the Claude Code adapter is installed, it SHALL persist a Bun preload
that skips Claude Code's agent status-summary timer, and SHALL add that
preload to `BUN_OPTIONS` in Claude settings without dropping other flags.
The preload SHALL install only inside Claude Code's compiled Bun image.
Doctor SHALL report whether the live settings carry the preload. A missing
preload SHALL be setup advice, not a blocked stage.

#### Scenario: Claude adapter setup wires the preload
- **WHEN** the Claude Code adapter setup runs
- **THEN** the installed factory holds the preload file
- **AND** Claude settings `env.BUN_OPTIONS` includes `--preload` with that absolute path
- **AND** existing `BUN_OPTIONS` flags remain

#### Scenario: Ordinary bun processes are not hooked
- **WHEN** the preload is loaded by a factory `bun` process whose main path is not Claude Code's compiled image
- **THEN** it does not wrap timers

#### Scenario: Cursor install is unchanged
- **WHEN** only the Cursor adapter is installed
- **THEN** no Claude settings `BUN_OPTIONS` preload is written

### Requirement: Proven Go mechanical edits apply without a model
The mechanical-edit helper SHALL apply a Go rename only for one unexported
declaration whose package occurrences are all listed. Import-only SHALL remove
unused ordinary imports and add a local package import only when its package
name resolves to one repository directory. Format-only SHALL use the Go
standard formatter. Every refusal SHALL leave all files unchanged and keep
`apply` on `select-model`.

#### Scenario: Complete unexported rename
- **WHEN** one unexported Go identifier is declared once and every package occurrence is in the listed files
- **THEN** every identifier token is renamed, strings and comments are unchanged, and `apply` is `script`

#### Scenario: Rename could affect code outside the proven graph
- **WHEN** the Go name is exported, shadowed, already has the target name, or occurs in an unlisted package file
- **THEN** `apply` is `select-model` and every file is unchanged

#### Scenario: Unique local package import
- **WHEN** an unbound selector name matches exactly one local package directory in the module
- **THEN** import-only adds that module import and `apply` is `script`

#### Scenario: Ambiguous local package import
- **WHEN** an unbound selector name matches more than one local package directory
- **THEN** no import is added

#### Scenario: Go format-only
- **WHEN** listed Go files parse and format-only is requested
- **THEN** the standard formatter writes canonical Go source and `apply` is `script`

### Requirement: Proven C# mechanical edits apply without a model
The mechanical-edit helper SHALL rename one C# declaration only when every
identifier token with that name is listed. It SHALL add a `using` only when a
used type name resolves to exactly one namespace declared in the repository.
Format-only SHALL require a repository executable at `bin/csharpier` and SHALL
accept its output only when the non-whitespace token stream is identical. Every
refusal SHALL leave files unchanged and keep `apply` on `select-model`.

#### Scenario: Complete C# rename
- **WHEN** one C# identifier is declared once and every occurrence is in listed files
- **THEN** identifier tokens are renamed, strings and comments are unchanged, and `apply` is `script`

#### Scenario: C# rename is not proven
- **WHEN** the name is overloaded or shadowed, the target exists, an occurrence is unlisted, or interpolation contains the name
- **THEN** files remain unchanged and `apply` is `select-model`

#### Scenario: Unique repository type import
- **WHEN** a used capitalized type name is declared in exactly one repository namespace
- **THEN** import-only adds that `using` and `apply` is `script`

#### Scenario: Ambiguous repository type import
- **WHEN** two repository namespaces declare the same used type name
- **THEN** no `using` is added

#### Scenario: C# format-only
- **WHEN** executable `bin/csharpier` returns a rewrite with the same token stream
- **THEN** the formatted source is written and `apply` is `script`

#### Scenario: C# formatter changes a token
- **WHEN** the formatter changes a name, literal, or other non-whitespace token
- **THEN** files remain unchanged and `apply` is `select-model`

### Requirement: Proven Kotlin mechanical edits apply without a model
The helper SHALL rename one Kotlin declaration only when every identifier token
with that name is listed. It SHALL add an import only when a used type resolves
to exactly one package-qualified declaration in the repository. Format-only
SHALL require `bin/ktfmt` and accept output only when the non-whitespace token
stream is identical. It SHALL NOT rename a Kotlin file with its type. Every
refusal SHALL leave files unchanged and keep `apply` on `select-model`.

#### Scenario: Complete Kotlin rename
- **WHEN** one Kotlin identifier is declared once and every occurrence is in listed files
- **THEN** identifier tokens are renamed, strings and comments are unchanged, and `apply` is `script`

#### Scenario: Kotlin rename is not proven
- **WHEN** the name is overloaded or shadowed, the target exists, an occurrence is unlisted, or a string template contains the name
- **THEN** files remain unchanged and `apply` is `select-model`

#### Scenario: Unique Kotlin type import
- **WHEN** a used capitalized type is declared at exactly one package-qualified path
- **THEN** import-only adds that import and `apply` is `script`

#### Scenario: Ambiguous Kotlin type import
- **WHEN** two package-qualified declarations have the same used type name
- **THEN** no import is added

#### Scenario: Kotlin format-only
- **WHEN** executable `bin/ktfmt` returns output with the same token stream
- **THEN** the formatted source is written and `apply` is `script`

### Requirement: Proven Rust format-only applies without a model
The helper SHALL recognize Rust files only for format-only. It SHALL require an
executable repository wrapper at `bin/rustfmt`, pass source on stdin with
`--emit stdout --edition 2021`, and accept output only when its conservative
non-whitespace token stream is identical. Rename and import-only SHALL remain
on `select-model`. Any refusal SHALL leave files unchanged.

#### Scenario: Rust formatter changes only layout
- **WHEN** `bin/rustfmt` returns output with the same token stream
- **THEN** the output is written and `apply` is `script`

#### Scenario: Rust formatter is unavailable or changes a token
- **WHEN** `bin/rustfmt` is absent, fails, or changes a non-whitespace token
- **THEN** files remain unchanged and `apply` is `select-model`

#### Scenario: Rust rename or import-only
- **WHEN** a Rust unit requests rename or import-only
- **THEN** files remain unchanged and `apply` is `select-model`
