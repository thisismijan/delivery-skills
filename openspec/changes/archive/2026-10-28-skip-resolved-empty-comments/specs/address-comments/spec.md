## MODIFIED Requirements

### Requirement: Comments are collected and narrowed before classification
The command SHALL read every comment on the change through the forge provider. A thread SHALL count as already handled only when its audit marker comes from an authenticated factory author, so a marker a person types cannot hide a thread, and a person's notes after the newest authenticated factory reply stay in scope. Resolved discussions and notes SHALL be removed before classification, and a comment whose trimmed body is empty SHALL receive a scripted `outdated` verdict.

#### Scenario: The holdout note is left out
- **WHEN** the change carries the holdout reviewer's note with the factory `auditComment` prefix
- **THEN** that note is neither classified nor answered

#### Scenario: Everyone else's comments are in scope
- **WHEN** the change carries comments from people, bots, or any author other than the holdout reviewer's audit note
- **THEN** each goes to classification unless a later rule marks it outdated or its discussion or note is already resolved

#### Scenario: A comment whose new-side anchor is gone is outdated without the classifier
- **WHEN** a remaining comment's new-side anchor points at a path missing at the pinned head, or at a line beyond the end of that file
- **THEN** the command gives it a scripted `outdated` verdict
- **AND** does not send it to the comment-assessor

#### Scenario: Unanchored, old-side, or unchecked anchors stay in scope
- **WHEN** a remaining comment has no anchor, an old-side anchor, or a path the command did not check
- **THEN** it stays in scope for classification

#### Scenario: A resolved discussion is removed before classification
- **WHEN** a discussion or note is already resolved
- **THEN** its comment is not sent to the comment-assessor

#### Scenario: An empty comment is outdated without the classifier
- **WHEN** a remaining comment's trimmed body is empty
- **THEN** the command gives it a scripted `outdated` verdict
- **AND** does not send it to the comment-assessor
