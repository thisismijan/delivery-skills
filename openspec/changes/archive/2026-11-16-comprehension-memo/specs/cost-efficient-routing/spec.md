## ADDED Requirements

### Requirement: Feasibility's comprehension memo is saved and reused
For medium or high complexity work, `/draft` SHALL save the feasibility
analyst's comprehension memo with the change, keeping only claims that cite a
file in the repository, and `/execute` SHALL include it in the test-writer and
implementer packets. The holdout reviewer SHALL NOT receive it.

#### Scenario: A medium-complexity ticket
- **WHEN** feasibility proceeds on a medium-complexity ticket with a memo
- **THEN** a memo citing a file for every kept claim is saved and the later execute packets include it

#### Scenario: Low complexity
- **WHEN** feasibility rates the work low complexity
- **THEN** no memo is written
