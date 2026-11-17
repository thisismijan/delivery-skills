# board-status-sync Specification

## Purpose
Moves each ticket forward across the team's board as delivery reaches each
SDLC phase, using a board map the operator confirmed, and leaves closing,
reopening, and backwards moves to people.

## Requirements

### Requirement: The board is interpreted into SDLC phases without guessing

`board-status.ts propose` SHALL map the phases `ready`, `in-progress`,
`in-review`, and `done` to board columns by name. A column that matches
more than one phase, or a phase that matches more than one column, SHALL
stay unresolved. Mapped phases SHALL follow board order, or the proposal
SHALL map nothing.

#### Scenario: A standard board is mapped
- **WHEN** the board columns are To Do, In Progress, Code Review, and Done
- **THEN** the proposal maps `ready` to To Do, `in-progress` to In Progress, `in-review` to Code Review, and `done` to Done

#### Scenario: An ambiguous column is left for the operator
- **WHEN** a column is named Ready for Review
- **THEN** that column is listed as ambiguous and no phase maps to it

#### Scenario: Columns out of phase order are refused
- **WHEN** the Done column comes before the In Progress column
- **THEN** the proposal maps no phase and names the order problem

### Requirement: Only an operator-confirmed map moves tickets

`board-status.ts confirm` SHALL write `.delivery/board-status.json` only
when it names the selected provider, the exact board columns, phases that
exist on the board in order, and the operator's approval words.

#### Scenario: A map without approval is refused
- **WHEN** confirm is given a map with no approval
- **THEN** it writes nothing and exits non-zero

#### Scenario: The board changed since confirmation
- **WHEN** the live board columns differ from the confirmed list
- **THEN** the move is skipped with a reason that asks for the map to be confirmed again

### Requirement: Phase moves go forward only and never block delivery

`board-status.ts sync` SHALL move a ticket to its phase's column only
when the ticket sits before that column. It SHALL skip with a plain
reason when no map exists, the phase is unmapped, the ticket is already
at or past the column, or the ticket sits in a column the map does not
know. A skip SHALL exit zero.

#### Scenario: A ticket moves forward
- **WHEN** execute starts on a ticket in To Do
- **THEN** the ticket moves to In Progress

#### Scenario: A ticket is never moved backwards
- **WHEN** draft finishes the spec for a ticket already In Progress
- **THEN** the move is skipped and the ticket stays In Progress

#### Scenario: No map means no move
- **WHEN** the repository has no confirmed board map
- **THEN** every phase move is skipped and delivery continues

### Requirement: Stages sync their phase at fixed boundaries

Draft SHALL sync `ready` after the spec-ready note. Execute SHALL sync
`in-progress` when it starts work and `in-review` after it opens the
draft change. Post-merge verify SHALL sync `done` after a verified
deploy. No stage SHALL close, reopen, or delete a ticket.

#### Scenario: Execute syncs both of its phases
- **WHEN** execute opens the draft change
- **THEN** it has synced `in-progress` at start and `in-review` after the change exists
