## MODIFIED Requirements

### Requirement: An acknowledgement-only comment does not start the comment-assessor

When gather-and-scope finds a comment whose body is only an acknowledgement such as LGTM, thanks, approved, or done, `/address-comments` SHALL NOT send that comment to the comment-assessor.

#### Scenario: An acknowledgement skips the assessor
- **WHEN** a remaining comment body is only an acknowledgement such as done or ditto
- **THEN** that comment is not passed to the comment-assessor
