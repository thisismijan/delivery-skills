## ADDED Requirements

### Requirement: An acknowledgement-only comment does not start the comment-assessor

When gather-and-scope finds a comment whose body is only an acknowledgement such as LGTM, thanks, or approved, `/address-comments` SHALL NOT send that comment to the comment-assessor. Remaining in-scope comments SHALL still dispatch exactly one assessor.

#### Scenario: An acknowledgement skips the assessor
- **WHEN** a remaining comment body is only an acknowledgement
- **THEN** that comment is not passed to the comment-assessor

#### Scenario: Mixed acknowledgements still use the assessor
- **WHEN** the body contains an acknowledgement and other review text
- **THEN** that comment stays in scope for the comment-assessor
