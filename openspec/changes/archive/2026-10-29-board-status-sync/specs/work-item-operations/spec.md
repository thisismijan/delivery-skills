## MODIFIED Requirements

### Requirement: Selected providers expose normalized operations
The system SHALL expose list, read, create, dependency-link, note, board
statuses, and status transition operations through one normalized
interface and SHALL return provider identity with every result.

#### Scenario: Operation succeeds
- **WHEN** the selected provider completes a supported operation
- **THEN** delivery receives a validated normalized result independent of provider-specific fields

#### Scenario: Operation is unsupported
- **WHEN** the selected provider does not implement the requested operation
- **THEN** delivery stops with an exact provider setup remedy and preserves completed artifacts

#### Scenario: Board statuses are read
- **WHEN** delivery reads board statuses for a ticket
- **THEN** it receives the settable columns in board order and the ticket's current column

### Requirement: Mutating work-item operations remain approval bounded
Create, dependency-link, and transition operations SHALL require explicit
approved input. A transition SHALL also require a confirmed board map
that names the target column, and SHALL fail when the ticket does not
land in that column. The interface SHALL NOT expose close, reopen, or
delete operations.

#### Scenario: Unapproved create
- **WHEN** a caller requests creation without approved plan evidence
- **THEN** the operation is refused before any local or remote provider runs

#### Scenario: Transition outside the board map
- **WHEN** a caller requests a transition to a column the confirmed map does not name
- **THEN** the operation is refused before any local or remote provider runs

#### Scenario: Status transition requested
- **WHEN** delivery would need to change work-item status
- **THEN** it moves the ticket only forward, to a column the confirmed board map names, through the board sync
- **AND** it leaves closing, reopening, deleting, and backwards moves to the human operator
