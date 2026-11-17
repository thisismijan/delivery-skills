## ADDED Requirements

### Requirement: A confirmed finding carries its variants
After adjudication confirms a finding at Medium or higher, the code review SHALL
search the changed files and their sibling paths in the change's affected areas
for the same root cause, verify each instance, and list it under that finding.
`/address-comments` SHALL fix every listed instance in the same round.

#### Scenario: A sibling instance in the change
- **WHEN** a confirmed Medium finding has the same defect in a sibling file of the change
- **THEN** the sibling is listed under that finding, not raised separately

#### Scenario: A Low finding
- **WHEN** a finding is rated Low
- **THEN** no variant search runs
