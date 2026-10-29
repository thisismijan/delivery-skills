## ADDED Requirements

### Requirement: The land stage is constitution gated
The SDLC constitution SHALL declare a ticket-scoped, mutating `land` stage
whose only write is `change-land`. `merge` SHALL stay a human-owned action,
meaning any merge outside the land gate.

#### Scenario: Run contract permits landing
- **WHEN** a frozen run contract lists `change-land` and the ticket
- **THEN** the land stage check passes

#### Scenario: Run contract predates landing
- **WHEN** a frozen run contract does not list `change-land`
- **THEN** the land stage check fails and the merge waits for a person
