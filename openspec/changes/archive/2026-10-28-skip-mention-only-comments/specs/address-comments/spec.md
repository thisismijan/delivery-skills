## MODIFIED Requirements

### Requirement: Scripted outdated comments skip the assessor

A body that is only a mention SHALL be recorded as a scripted `outdated` verdict and SHALL NOT be sent to the comment-assessor. A mention plus other review text SHALL stay in scope.

#### Scenario: A mention-only body is outdated without a classifier
- **WHEN** a remaining comment body is only a mention
- **THEN** the command records a scripted `outdated` verdict for it
- **AND** does not pass that comment to the comment-assessor

#### Scenario: A mention with extra prose still uses the classifier
- **WHEN** the body contains a mention and other review text
- **THEN** that comment stays in scope for the comment-assessor
