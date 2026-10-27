## ADDED Requirements

### Requirement: An empty in-scope list does not start a comment assessor

When gather-and-scope returns no in-scope comments, `/address-comments` SHALL write an empty classification verdict and SHALL NOT dispatch the comment-assessor. A non-empty in-scope list SHALL still dispatch exactly one assessor.

#### Scenario: Zero in-scope comments skip the assessor
- **WHEN** every discussion is already handled or every remaining comment is scripted outdated
- **THEN** no comment-assessor is dispatched and classification is an empty array plus any scripted outdated verdicts

#### Scenario: Remaining comments still use one assessor
- **WHEN** at least one in-scope comment remains after scoping
- **THEN** exactly one comment-assessor is dispatched with only those comments
