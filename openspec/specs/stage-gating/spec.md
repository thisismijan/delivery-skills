# stage-gating

## Purpose

Stops mutating stages on a host that does not declare an enforced mutation boundary, while read-only stages remain available.

## Requirements

### Requirement: Mutating stages require enforced mutation boundaries
A mutating stage SHALL NOT start on a host that does not declare enforced mutation boundaries, and read-only stages SHALL remain available on every host.

#### Scenario: Unenforced host
- **WHEN** a mutating stage starts on a host declared unenforced
- **THEN** the stage stops with a reason, while read-only stages still run

#### Scenario: Unknown host or stage
- **WHEN** the host capability or the stage is missing or unrecognised
- **THEN** the stage is denied

#### Scenario: Enforced host
- **WHEN** a mutating stage starts on a host declared enforced
- **THEN** the stage is allowed

### Requirement: Host declarations follow real enforcement
A host SHALL be declared enforced only after setup verifies a real denial hook. Claude Code verifies PreToolUse. Cursor verifies `hooks.json`. Static adapter declaration alone SHALL NOT authorize a mutating stage.

#### Scenario: Cursor mutating stage without a verified hook
- **WHEN** a mutating stage starts on Cursor before hook verification
- **THEN** it is blocked

#### Scenario: Cursor mutating stage with a verified hook
- **WHEN** Cursor setup has persisted and verified `hooks.json`
- **THEN** mutating stages are allowed

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

### Requirement: Advisory output gets one repair turn and gates stay strict
Every subagent output SHALL be listed as gating or advisory. A gating output
that fails to parse SHALL fail closed at once with no repair. An advisory output
that fails to parse SHALL get one repair turn from the same subagent, doing no
new work, and a second failure SHALL fail closed. An output not on the list
SHALL be treated as gating.

#### Scenario: Malformed lens candidates
- **WHEN** a review lens returns a report that cannot be parsed
- **THEN** that lens gets one repair turn, and a second failure stops the review

#### Scenario: A malformed gating verdict
- **WHEN** a feasibility or holdout verdict cannot be parsed
- **THEN** the run fails closed at once
