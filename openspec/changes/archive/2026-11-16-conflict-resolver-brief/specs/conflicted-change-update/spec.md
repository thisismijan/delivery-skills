## ADDED Requirements

### Requirement: Real conflicts are resolved under a brief that never drops landed work

When a branch update stops on real conflicts, auto SHALL dispatch the
`conflict-resolver` subagent, which SHALL edit only the conflict hunks, keep
both sides' intent, and never weaken a test or check. When it reports a hunk
whose change side it could not keep, or a conflict marker remains, auto SHALL
abort the rebase and stop for a person.

#### Scenario: Both intents fit

- **GIVEN** a conflict where both sides changed the same function compatibly
- **WHEN** the resolver runs
- **THEN** the resolved file does both and auto continues the rebase

#### Scenario: The intents clash

- **GIVEN** a conflict where the change's edit contradicts behaviour the target shipped
- **WHEN** the resolver reports it under Could not keep
- **THEN** auto aborts the rebase and stops for a person without pushing
