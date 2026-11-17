## MODIFIED Requirements

### Requirement: Scripted outdated comments skip the assessor

A body that is only an acknowledgement such as LGTM, thanks, approved, or done SHALL be recorded as a scripted `outdated` verdict and SHALL NOT be sent to the comment-assessor.

#### Scenario: An acknowledgement is outdated without a classifier
- **WHEN** a remaining comment body is only an acknowledgement such as LGTM, thanks, approved, or done
- **THEN** the command records a scripted `outdated` verdict for it
- **AND** does not pass that comment to the comment-assessor
