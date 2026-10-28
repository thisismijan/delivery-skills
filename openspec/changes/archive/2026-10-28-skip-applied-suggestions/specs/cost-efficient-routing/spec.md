## ADDED Requirements

### Requirement: An applied suggestion does not start the comment-assessor

When gather-and-scope finds a comment whose body is only a suggestion fence and whose suggested text is already present in the anchored file, `/address-comments` SHALL NOT send that comment to the comment-assessor. Remaining in-scope comments SHALL still dispatch exactly one assessor.

#### Scenario: An applied suggestion skips the assessor
- **WHEN** a remaining comment is only a suggestion already present in the file
- **THEN** that comment is not passed to the comment-assessor

#### Scenario: Unapplied suggestions still use the assessor
- **WHEN** the suggested text is not in the file, or the body has extra prose
- **THEN** that comment stays in scope for the comment-assessor
