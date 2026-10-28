## MODIFIED Requirements

### Requirement: Scripted outdated comments skip the assessor

A body that is only a URL SHALL be recorded as a scripted `outdated` verdict and SHALL NOT be sent to the comment-assessor. A URL plus other review text SHALL stay in scope.

#### Scenario: A URL-only body is outdated without a classifier
- **WHEN** a remaining comment body is only a URL
- **THEN** the command records a scripted `outdated` verdict for it
- **AND** does not pass that comment to the comment-assessor

#### Scenario: A URL with extra prose still uses the classifier
- **WHEN** the body contains a URL and other review text
- **THEN** that comment stays in scope for the comment-assessor
