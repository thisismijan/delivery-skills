## ADDED Requirements

### Requirement: The build and comment skills say what must not start them
The `/execute` and `/address-comments` descriptions SHALL each carry a start
clause and a not-for clause. The skill metadata check SHALL cover groom, draft,
execute, and address-comments, and fail and name any of them whose description
has no not-for clause.

#### Scenario: A lost clause on execute
- **WHEN** the execute description has no not-for clause
- **THEN** the skill metadata check fails and names execute

#### Scenario: Skills outside the list
- **WHEN** delivery, code-review-max, or mr-review has no not-for clause
- **THEN** the check does not flag it
