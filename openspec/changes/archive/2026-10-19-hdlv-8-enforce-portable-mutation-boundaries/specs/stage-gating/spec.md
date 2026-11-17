## ADDED Requirements

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
Claude Code SHALL be declared enforced and Cursor SHALL stay declared unenforced until a real enforcement hook exists.

#### Scenario: Cursor mutating stage
- **WHEN** a mutating stage starts on Cursor
- **THEN** it is blocked
