## MODIFIED Requirements

### Requirement: Scripted outdated comments skip the assessor

A comment whose body is only a suggestion fence, and whose suggested text is already present in the anchored file at the pinned head, SHALL be recorded as a scripted `outdated` verdict and SHALL NOT be sent to the comment-assessor. Extra prose beside a suggestion SHALL stay in scope.

#### Scenario: An applied suggestion is outdated without a classifier
- **WHEN** a remaining comment body is only a suggestion fence
- **AND** that suggested text is already present in the anchored file at the pinned head
- **THEN** the command records a scripted `outdated` verdict for it
- **AND** does not pass that comment to the comment-assessor

#### Scenario: A suggestion with extra prose still uses the classifier
- **WHEN** the body contains a suggestion fence and other review text
- **THEN** that comment stays in scope for the comment-assessor
