## ADDED Requirements

### Requirement: Resolved and empty comments do not start the comment-assessor

When gather-and-scope finds a resolved discussion, a resolved note, or a comment whose body is empty after trim, `/address-comments` SHALL NOT send that comment to the comment-assessor. Remaining in-scope comments SHALL still dispatch exactly one assessor.

#### Scenario: A resolved discussion skips the assessor
- **WHEN** a discussion or note is already resolved
- **THEN** that comment is not passed to the comment-assessor

#### Scenario: An empty body is outdated without a classifier
- **WHEN** a remaining comment body is empty after trim
- **THEN** classification includes a scripted outdated verdict for that comment
- **AND** the comment-assessor does not receive it
