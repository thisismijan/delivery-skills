## MODIFIED Requirements

### Requirement: Gather and scope comments
The command SHALL gather all MR comments via the forge provider. It SHALL treat a thread as previously handled only when the audit marker belongs to an authenticated factory author. Human notes after the latest authenticated factory reply remain in scope; a human-authored marker cannot hide a thread. It SHALL drop resolved discussions and resolved notes before classification. It SHALL record a scripted `outdated` verdict for a comment whose body is empty after trim.

#### Scenario: Holdout note is excluded
- **WHEN** the MR contains the holdout-reviewer's note carrying the factory `auditComment` prefix
- **THEN** that note is neither classified nor replied to

#### Scenario: All other comments are in scope
- **WHEN** the MR contains comments from humans, the smai bot, or anyone other than the holdout-reviewer's audit note
- **THEN** each such comment is passed to classification unless a later scoping rule marks it outdated or the discussion or note is already resolved

#### Scenario: A gone new-side anchor is outdated without a classifier
- **WHEN** a remaining comment has a new-side anchor whose path is missing at the pinned head, or whose line is past the end of that file
- **THEN** the command records a scripted `outdated` verdict for it
- **AND** does not pass that comment to the comment-assessor

#### Scenario: Unknown or old-side anchors stay in scope
- **WHEN** a remaining comment has no anchor, an old-side anchor, or a path the command did not look up
- **THEN** that comment stays in scope for classification

#### Scenario: A resolved discussion is dropped before classification
- **WHEN** a discussion or note is already resolved
- **THEN** that comment is not passed to the comment-assessor

#### Scenario: An empty body is outdated without a classifier
- **WHEN** a remaining comment body is empty after trim
- **THEN** the command records a scripted `outdated` verdict for it
- **AND** does not pass that comment to the comment-assessor
