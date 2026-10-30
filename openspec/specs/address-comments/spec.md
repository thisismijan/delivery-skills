# address-comments

## Purpose

Resolves review comments on an existing change: classify every in-scope
comment, action or skip it, reply on assessed threads, and hold the merge
request draft. Scripted rules run before the comment-assessor.

## Requirements

### Requirement: Scripted outdated comments skip the assessor

When gather-and-scope finds a new-side anchor whose path is missing at the pinned head, or whose line is past the end of that file, `/address-comments` SHALL record a scripted `outdated` verdict and SHALL NOT send that comment to the comment-assessor. An empty or whitespace-only body SHALL be outdated the same way. A body that is only acknowledgements such as LGTM, thanks, approved, or done SHALL be outdated the same way. A body that is only a mention SHALL be outdated the same way. A body that is only a URL SHALL be outdated the same way. A body that is only emoji SHALL be outdated the same way. A comment whose body is only a suggestion fence, and whose suggested text is already present in that file, SHALL be outdated the same way. Resolved discussions and resolved notes SHALL be dropped before classification. Unanchored comments, old-side anchors, and paths the command did not look up SHALL stay in scope. When no in-scope comments remain, the command SHALL NOT dispatch the assessor.

#### Scenario: A gone new-side line is outdated
- **WHEN** a remaining comment has a new-side anchor on a missing file or a line past the end of the file at the pinned head
- **THEN** classification includes a scripted outdated verdict for that comment
- **AND** the comment-assessor does not receive it

#### Scenario: Empty in-scope list skips the assessor
- **WHEN** gather-and-scope leaves zero in-scope comments
- **THEN** no comment-assessor is dispatched
- **AND** classification is the scripted outdated verdicts or an empty array

#### Scenario: A resolved discussion is dropped before classification
- **WHEN** a discussion or note is already resolved
- **THEN** that comment is not passed to the comment-assessor

#### Scenario: An empty body is outdated without a classifier
- **WHEN** a remaining comment body is empty after trim
- **THEN** the command records a scripted `outdated` verdict for it
- **AND** does not pass that comment to the comment-assessor

#### Scenario: An acknowledgement is outdated without a classifier
- **WHEN** a remaining comment body is only acknowledgements such as LGTM, thanks, approved, or done
- **THEN** the command records a scripted `outdated` verdict for it
- **AND** does not pass that comment to the comment-assessor

#### Scenario: A mention-only body is outdated without a classifier
- **WHEN** a remaining comment body is only a mention
- **THEN** the command records a scripted `outdated` verdict for it
- **AND** does not pass that comment to the comment-assessor

#### Scenario: A URL-only body is outdated without a classifier
- **WHEN** a remaining comment body is only a URL
- **THEN** the command records a scripted `outdated` verdict for it
- **AND** does not pass that comment to the comment-assessor

#### Scenario: An emoji-only body is outdated without a classifier
- **WHEN** a remaining comment body is only emoji
- **THEN** the command records a scripted `outdated` verdict for it
- **AND** does not pass that comment to the comment-assessor

#### Scenario: An applied suggestion is outdated without a classifier
- **WHEN** a remaining comment body is only a suggestion fence
- **AND** that suggested text is already present in the anchored file at the pinned head
- **THEN** the command records a scripted `outdated` verdict for it
- **AND** does not pass that comment to the comment-assessor

### Requirement: A bug repeating an earlier round's assumption gets a premise check
Every bug the comment assessor classifies SHALL carry a kebab-case label for
the design assumption it breaks. Address-comments SHALL record each round with
`review-rounds.ts record`. When a bug's label appeared in an earlier round,
address-comments SHALL state the premise and run one discriminating
observation before any fix, and SHALL record the outcome with
`review-rounds.ts premise`. When a label repeats after its premise check, the
round SHALL stop for the operator.

#### Scenario: New assumption
- **WHEN** no bug in the round repeats an earlier round's label
- **THEN** `record` exits 0 and the round continues

#### Scenario: Repeated assumption
- **WHEN** a bug's label appeared in any earlier round
- **THEN** `record` exits 3 and no fix for that comment is written before the premise check is recorded

#### Scenario: Repeated after a premise check
- **WHEN** a label repeats in a later round after its premise check
- **THEN** `record` exits 1 and the round stops with zero commits

#### Scenario: Re-entry
- **WHEN** the same head is recorded again
- **THEN** that round is replaced and the round count does not grow

#### Scenario: Missing label
- **WHEN** a bug has no assumption label, or a non-bug has one
- **THEN** the classification verdict is refused

### Requirement: Formatting and spec edits go in the fix commit
Each actioned comment SHALL produce one fix commit, after a test-only commit
for a bug. The repository's formatter SHALL run on the changed files before
each commit, and a spec update for the fix SHALL be in the same commit. A lint
failure that is only formatting SHALL amend the unpushed commit instead of
adding a formatting-only commit.

#### Scenario: Fix that changes specified behaviour
- **WHEN** a fix changes behaviour the OpenSpec change describes
- **THEN** the spec update is in the fix commit, not a commit of its own

#### Scenario: Lint fails only on formatting
- **WHEN** lint fails only because the fix commit is not formatted
- **THEN** the formatter runs, the unpushed commit is amended, and the gates run again
