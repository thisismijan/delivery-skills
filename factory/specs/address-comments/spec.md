# address-comments Specification

## Purpose

This capability covers `/address-comments`, the command that works through the review comments on a change that already exists, with the same tests-first and holdout discipline as the rest of the factory. It classifies every comment, then actions, disputes, answers, or skips each one according to its class, replies on every thread it assessed, and reruns the cumulative green, lint, and type-check gates when code changed. It runs no review of its own: the Stage 3 dual review checks the fixes next, and the change stays in draft until then. The factory never merges, closes, or resolves threads.

## Requirements

### Requirement: The ticket must already have an open change
Before any other work, the command SHALL locate the spec branch and change for the work-item key with `find-change.ts` and confirm that an open change exists for it. When the branch has no change, the command MUST stop and escalate, with no commit made and nothing posted.

#### Scenario: The ticket has no change
- **WHEN** `/address-comments <KEY>` runs and the resolved spec branch has no change
- **THEN** the command halts and escalates
- **AND** it makes no commit
- **AND** it posts nothing to the tracker or the change

#### Scenario: More than one branch or change matches
- **WHEN** `find-change.ts` gives back more than one candidate for the work-item key
- **THEN** the command stops and escalates, without picking one and without going further

### Requirement: Comments are collected and narrowed to the ones in scope
The command SHALL fetch every comment on the change through the forge provider. A thread SHALL count as already handled only when its audit marker comes from an authenticated factory author, so a marker typed by a person can never hide a thread, and a person's notes posted after the latest authenticated factory reply stay in scope. Resolved discussions and resolved notes SHALL be removed before classification. A comment whose body is empty once trimmed SHALL receive a scripted `outdated` verdict.

#### Scenario: The holdout note is left out
- **WHEN** the change carries the holdout reviewer's note with the factory `auditComment` prefix
- **THEN** that note is neither classified nor answered

#### Scenario: Everyone else's comments are in scope
- **WHEN** the change carries comments from people, a bot, or any author other than the holdout reviewer's audit note
- **THEN** each of those comments goes to classification, unless a later scoping rule marks it outdated or its discussion or note is already resolved

#### Scenario: A comment whose new-side anchor is gone is outdated without the classifier
- **WHEN** a remaining comment is anchored on the new side to a path that does not exist at the pinned head, or to a line beyond the end of that file
- **THEN** the command records a scripted `outdated` verdict for it
- **AND** the comment-assessor never receives it

#### Scenario: Unknown and old-side anchors remain in scope
- **WHEN** a remaining comment has no anchor, an old-side anchor, or a path the command did not check
- **THEN** that comment remains in scope for classification

#### Scenario: A resolved discussion is removed before classification
- **WHEN** a discussion or note has already been resolved
- **THEN** the comment-assessor never receives that comment

#### Scenario: An empty comment is outdated without the classifier
- **WHEN** a remaining comment's body is empty once trimmed
- **THEN** the command records a scripted `outdated` verdict for it
- **AND** the comment-assessor never receives it

### Requirement: Every assessed comment is classified
The command SHALL dispatch one read-only `comment-assessor` subagent, holding only the `Read, Grep, Glob` tools, which classifies all in-scope comments together in one batch, giving each exactly one of `bug`, `test-gap`, `non-functional`, `nitpick`, `false-positive`, `question`, or `outdated`. The Zod `ClassificationVerdict` schema SHALL validate its output, and a verdict that is malformed or absent MUST fail closed by stopping and escalating. When collecting and narrowing leaves no comment in scope, the command SHALL NOT dispatch the assessor.

#### Scenario: One read-only assessor classifies the whole batch
- **WHEN** classification runs and at least one comment is in scope
- **THEN** exactly one `comment-assessor` subagent is dispatched, holding only the `Read, Grep, Glob` tools
- **AND** it returns, in one batch, an array of classification verdicts, one per comment, that Zod has validated

#### Scenario: Nothing in scope means no assessor
- **WHEN** collecting and narrowing leaves no comment in scope
- **THEN** the comment-assessor is not dispatched
- **AND** the classification consists of the scripted outdated verdicts, or is an empty array

#### Scenario: A malformed classification fails closed
- **WHEN** the comment-assessor's output does not pass `ClassificationVerdict` Zod validation
- **THEN** the command stops and escalates, and actions none of the comments

### Requirement: A bug comment is fixed tests-first
For a comment classified `bug`, the command SHALL first write a failing test aimed at that comment and prove with `test-gate.ts` that it fails, and only then write fix code that makes the suite pass. The fix SHALL be its own commit that refers to the comment, and the reply on that thread SHALL give the commit SHA.

#### Scenario: A bug is fixed after a red test
- **WHEN** the class given to a comment is `bug`
- **THEN** a failing test is written and shown to fail before any fix exists
- **AND** the fix makes the suite pass
- **AND** a commit of its own refers to the comment
- **AND** the reply says what changed and gives the commit SHA

### Requirement: A test-gap comment is proven with a mutation
For a comment classified `test-gap`, meaning it asks only for a test of behaviour the assessor confirmed is already correct, the command SHALL write and commit that test without a red gate, require the green gate, lint, and the type check to pass, and then prove the test fails when a minimal source patch breaks exactly that behaviour. The reply SHALL give the commit SHA and say the test was shown to fail when the behaviour is broken.

#### Scenario: A test-gap test bites
- **WHEN** a `test-gap` comment is actioned
- **THEN** the new test passes on the current code, fails under the mutation patch, and the reply names the commit

### Requirement: A non-functional comment needs only green gates
For a comment classified `non-functional`, meaning a refactor, style, naming, or docs change, the command SHALL commit the change and require the green gate, lint, and the type check to pass, with no new test needed. The reply SHALL give the commit SHA.

#### Scenario: A non-functional change passes the green gates
- **WHEN** the class given to a comment is `non-functional`
- **THEN** the change is committed, and the green gate, lint, and the type check all pass
- **AND** no new test is needed
- **AND** the reply says what changed and gives the commit SHA

### Requirement: Nitpicks and false positives are disputed
For a comment classified `nitpick` or `false-positive`, the command SHALL change no code, SHALL post a reply giving its reasons, and SHALL report the comment as disputed, leaving the human to decide. The thread SHALL stay unresolved.

#### Scenario: A disputed comment changes nothing
- **WHEN** the class given to a comment is `nitpick` or `false-positive`
- **THEN** no code is changed
- **AND** a reply giving the reasons is posted
- **AND** the comment is reported as disputed, with the human to decide
- **AND** the thread stays unresolved

### Requirement: Questions are answered and outdated comments skipped
For a comment classified `question`, the command SHALL post a reply and SHALL change code only when the answer calls for it. A comment classified `outdated`, or one already resolved, SHALL be skipped with no reply and no code change.

#### Scenario: A question gets an answer
- **WHEN** the class given to a comment is `question`
- **THEN** a reply is posted
- **AND** code changes only if the answer calls for it

#### Scenario: An outdated comment is passed over
- **WHEN** a comment is classified `outdated` or has already been resolved
- **THEN** it is skipped, with no reply and no code change

### Requirement: Every assessed thread gets a reply
When N comments are assessed, the command SHALL post exactly N replies, each one an action, an answer, or a dispute, so that no comment is quietly ignored. Each reply SHALL carry the `auditComment` prefix. The factory SHALL never mark a thread resolved.

#### Scenario: One reply per assessed thread
- **WHEN** N comments are assessed
- **THEN** exactly N replies are posted, each an action, an answer, or a dispute
- **AND** no comment is quietly ignored

#### Scenario: The factory leaves every thread unresolved
- **WHEN** a comment is actioned, answered, disputed, or skipped
- **THEN** no thread is marked resolved, whatever the outcome

### Requirement: Cumulative gates close a round that changed code
Once every actionable comment has been handled, the command SHALL compare the current head with the head it recorded before processing comments. If the head moved, or a pending-gate marker existed on entry, it SHALL save the marker before posting any reply, run the cumulative green, lint, and type-check gates over the whole branch, repair only the source within the fix-attempt budget, and remove the marker once all three pass. If the head did not move and there was no marker on entry, it SHALL skip those gates. Either way it SHALL run no review of its own, leave the change in draft, record `[addressed !N]`, post one summary note, and leave the fixes to the Stage 3 dual review, the only authority that may take the change out of draft.

#### Scenario: Code changed in the round
- **WHEN** at least one comment produced a commit
- **THEN** the cumulative green, lint, and type-check gates run and pass before the summary note
- **AND** the change stays in draft with status `[addressed !N]`

#### Scenario: Only replies in the round
- **WHEN** every assessed comment was answered, disputed, or skipped without a code commit, and there was no marker on entry
- **THEN** the cumulative gates are skipped
- **AND** the Stage 3 dual review is still needed before the change can be ready

#### Scenario: A pending marker outlives a restart
- **WHEN** there was a pending-gate marker on entry and no comments are left
- **THEN** the cumulative gates run anyway

#### Scenario: Gates that keep failing stop the round
- **WHEN** the cumulative gates still fail after the fix-attempt budget
- **THEN** the command stops and escalates, leaving the change in draft

### Requirement: The command never merges, closes, or moves the ticket
The command SHALL never merge or close the change through the forge, and SHALL never change the work item's status. The one summary comment is its only write to the tracker.

#### Scenario: No merge, no close, no status change
- **WHEN** the command runs, whatever its outcome
- **THEN** the change is never merged or closed
- **AND** the work item's status never changes
