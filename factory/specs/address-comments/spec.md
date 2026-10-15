# address-comments Specification

## Purpose

Define the behaviour of `/address-comments`, which resolves an existing MR's review comments with tests-first/holdout rigor: classify every comment, action/dispute/answer/skip per class, reply on every assessed thread, then gate the result on a single cumulative Opus holdout re-review. The factory never merges, closes, or resolves threads.

## Requirements

### Requirement: Precondition — an MR must exist for the ticket
The command SHALL resolve the spec branch/change for the Jira key via `find-change.ts` and confirm an open MR exists before doing any work. If no MR exists for the branch, the command MUST stop, escalate, make zero commits, and post nothing.

#### Scenario: No MR for the ticket
- **WHEN** `/address-comments <KEY>` is invoked and no MR exists for the resolved spec branch
- **THEN** the command stops and escalates
- **AND** no commits are made
- **AND** nothing is posted to Jira or the MR

#### Scenario: Ambiguous branch/change match
- **WHEN** `find-change.ts` returns more than one candidate for the Jira key
- **THEN** the command stops and escalates without guessing or proceeding

### Requirement: Gather and scope comments
The command SHALL gather all MR comments (inline diff comments, discussion threads, and general notes) via `glab`, and SHALL exclude the holdout-reviewer's own audit-marked note from classification and from replies. Every other comment SHALL be assessed.

#### Scenario: Holdout note is excluded
- **WHEN** the MR contains the holdout-reviewer's note carrying the `ig-spec` `auditComment` prefix
- **THEN** that note is neither classified nor replied to

#### Scenario: All other comments are in scope
- **WHEN** the MR contains comments from humans, the smai bot, or anyone other than the holdout-reviewer's audit note
- **THEN** each such comment is passed to classification

### Requirement: Classify every assessed comment
The command SHALL dispatch a single read-only `comment-assessor` subagent (tools `Read, Grep, Glob` only) that classifies all in-scope comments in one batch, each into exactly one of `bug`, `non-functional`, `nitpick`, `false-positive`, `question`, `outdated`. The output SHALL be validated by the Zod `ClassificationVerdict` schema; a malformed or missing verdict MUST fail closed (stop + escalate).

#### Scenario: Comment-assessor is read-only and batched
- **WHEN** classification runs
- **THEN** exactly one `comment-assessor` subagent is dispatched with only `Read, Grep, Glob` tools
- **AND** it returns a Zod-validated array of per-comment classification verdicts in one batch

#### Scenario: Malformed classification verdict fails closed
- **WHEN** the comment-assessor output fails `ClassificationVerdict` Zod validation
- **THEN** the command stops and escalates and actions no comments

### Requirement: Action bug comments tests-first
For a comment classified `bug`, the command SHALL write a failing test scoped to that comment and prove it red via `test-gate.ts` (tests fail) BEFORE writing any fix code, then bring the suite to green. The change SHALL be a dedicated commit referencing the comment, and the reply on that thread SHALL include the commit SHA.

#### Scenario: Bug comment is actioned tests-first
- **WHEN** a comment is classified `bug`
- **THEN** a failing test is written and proven red before the fix
- **AND** the fix brings the suite to green
- **AND** a dedicated commit references the comment
- **AND** a reply states what changed with the commit SHA

### Requirement: Action non-functional comments green-only
For a comment classified `non-functional` (refactor / style / naming / docs), the command SHALL commit the change and require the green gate plus lint plus typecheck to pass, with no new test required. The reply SHALL include the commit SHA.

#### Scenario: Non-functional comment is actioned green-only
- **WHEN** a comment is classified `non-functional`
- **THEN** the change is committed and the green gate plus lint plus typecheck pass
- **AND** no new test is required
- **AND** a reply states what changed with the commit SHA

### Requirement: Dispute nitpick and false-positive comments
For a comment classified `nitpick` or `false-positive`, the command SHALL make no code change, post a reasoned reply, and report it as "disputed — human decides". The thread SHALL be left unresolved.

#### Scenario: Disputed comment makes no change
- **WHEN** a comment is classified `nitpick` or `false-positive`
- **THEN** no code change is made
- **AND** a reasoned reply is posted
- **AND** it is reported as "disputed — human decides"
- **AND** the thread is left unresolved

### Requirement: Answer questions and skip outdated
For a comment classified `question`, the command SHALL post a reply, making a code change only if the answer requires one. For a comment classified `outdated` or already resolved, the command SHALL skip it (no reply, no code change).

#### Scenario: Question is answered
- **WHEN** a comment is classified `question`
- **THEN** a reply is posted
- **AND** a code change is made only if the answer requires one

#### Scenario: Outdated comment is skipped
- **WHEN** a comment is classified `outdated` or is already resolved
- **THEN** it is skipped with no reply and no code change

### Requirement: Reply on every assessed thread
For N assessed comments, the command SHALL post exactly N replies (actioned, answered, or disputed); none are silently ignored. Replies SHALL carry the `auditComment` prefix. The factory SHALL never mark any thread resolved.

#### Scenario: Every thread gets a reply
- **WHEN** N comments are assessed
- **THEN** exactly N replies are posted (actioned, answered, or disputed)
- **AND** none are silently ignored

#### Scenario: Threads are never resolved by the factory
- **WHEN** any comment is actioned, answered, disputed, or skipped
- **THEN** no thread is marked resolved regardless of outcome

### Requirement: Cumulative holdout re-review gates the result
After all actionable comments are addressed, the command SHALL dispatch a fresh Opus `holdout-reviewer` over the cumulative updated diff (not per-comment) and validate its verdict via `review-route.ts`/Zod. On `approve` the MR SHALL be re-marked ready and a single Jira summary comment (MR link + actioned/disputed/skipped counts) posted. On anything other than `approve`, or on a verdict that fails validation, the command MUST fail closed and escalate, leaving the MR unblessed and posting no "passed" Jira comment.

#### Scenario: Approved re-review re-marks ready
- **WHEN** the cumulative holdout re-review returns `approve`
- **THEN** the MR is re-marked ready
- **AND** a single Jira summary comment with the MR link and actioned/disputed/skipped counts is posted

#### Scenario: Non-approve re-review fails closed
- **WHEN** the cumulative holdout re-review returns anything other than `approve`
- **THEN** the command fails closed and escalates with the MR left unblessed

#### Scenario: Malformed re-review verdict fails closed
- **WHEN** the holdout verdict fails Zod validation
- **THEN** the command stops and escalates
- **AND** the MR is not re-marked ready
- **AND** no Jira "passed" comment is posted

### Requirement: Factory never merges, closes, or transitions
The command SHALL never invoke `glab mr merge` or `glab mr close`, and SHALL never transition Jira status. Its only Jira write is the single summary comment.

#### Scenario: No merge, close, or status transition
- **WHEN** the command runs to any outcome
- **THEN** `glab mr merge` and `glab mr close` are never invoked
- **AND** Jira status is never transitioned
