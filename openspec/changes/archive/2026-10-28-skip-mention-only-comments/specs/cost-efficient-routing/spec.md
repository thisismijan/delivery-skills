## ADDED Requirements

### Requirement: A mention-only comment does not start the comment-assessor

When gather-and-scope finds a comment whose body is only a mention, `/address-comments` SHALL NOT send that comment to the comment-assessor. Remaining in-scope comments SHALL still dispatch exactly one assessor.

#### Scenario: A mention-only body skips the assessor
- **WHEN** a remaining comment body is only a mention
- **THEN** that comment is not passed to the comment-assessor

#### Scenario: A mention with extra prose still uses the assessor
- **WHEN** the body contains a mention and other review text
- **THEN** that comment stays in scope for the comment-assessor
