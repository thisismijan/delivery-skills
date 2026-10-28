## MODIFIED Requirements

### Requirement: Scripted outdated comments skip the assessor

A body that is only emoji SHALL be recorded as a scripted `outdated` verdict and SHALL NOT be sent to the comment-assessor. Emoji plus other review text SHALL stay in scope.

#### Scenario: An emoji-only body is outdated without a classifier
- **WHEN** a remaining comment body is only emoji
- **THEN** the command records a scripted `outdated` verdict for it
- **AND** does not pass that comment to the comment-assessor

#### Scenario: Emoji with extra prose still uses the classifier
- **WHEN** the body contains emoji and other review text
- **THEN** that comment stays in scope for the comment-assessor
