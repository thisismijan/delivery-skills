## ADDED Requirements

### Requirement: A blocked work item does not start draft assessors

When `/draft` fetches a work item whose recorded blocker list is not empty, it SHALL write a clarification assessment naming those blockers and SHALL NOT dispatch the ticket-assessor or the feasibility-analyst.

#### Scenario: Recorded blockers skip the assessor
- **WHEN** the fetched work item lists one or more blockers
- **THEN** no ticket-assessor is dispatched
- **AND** assessment quality is `needs_clarification` with those blocker references

#### Scenario: An unblocked structurally valid ticket still uses the assessor
- **WHEN** the blocker list is empty and the body passes structural verification
- **THEN** exactly one ticket-assessor is dispatched
