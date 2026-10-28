## MODIFIED Requirements

### Requirement: Scripted outdated comments skip the assessor

A body that is only an acknowledgement such as LGTM, thanks, or approved SHALL be recorded as a scripted `outdated` verdict and SHALL NOT be sent to the comment-assessor. Extra prose beside an acknowledgement SHALL stay in scope.

#### Scenario: An acknowledgement is outdated without a classifier
- **WHEN** a remaining comment body is only an acknowledgement such as LGTM, thanks, or approved
- **THEN** the command records a scripted `outdated` verdict for it
- **AND** does not pass that comment to the comment-assessor

#### Scenario: Extra prose beside an acknowledgement still uses the classifier
- **WHEN** the body contains an acknowledgement and other review text
- **THEN** that comment stays in scope for the comment-assessor
