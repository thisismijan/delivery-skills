# conflicted-change-update Specification

## Purpose
Brings a change that the forge reports as conflicted up to date by script during continuous delivery, and never overwrites a branch that moved.

## Requirements

### Requirement: Auto updates a conflicted change by script

When conflicts are the only reason land or readiness stopped, `/delivery auto`
SHALL squash the change's commits, rebase them onto the target, and
force-push with the head it read as the lease. It SHALL start an agent only
when the rebase stops on real conflicts. It SHALL then rerun the green gate
and a delta review on the new head before the change can be ready.

#### Scenario: A branch that rebases cleanly

- **GIVEN** a change reported as conflicted whose branch rebases cleanly
- **WHEN** auto updates it
- **THEN** the branch is one commit on the target, pushed with lease, with no agent dispatched
- **AND** the green gate and a delta review rerun

#### Scenario: Real conflicts

- **GIVEN** a rebase that stops on conflicting files
- **WHEN** auto updates the branch
- **THEN** one agent resolves the listed files, the push finishes with the same lease, and the gates rerun

### Requirement: A branch that moved is never overwritten

The update SHALL NOT push when the remote branch is no longer at the head auto
read, and auto SHALL stop with that reason.

#### Scenario: The remote branch moved

- **GIVEN** someone pushed to the change branch after auto read it
- **WHEN** the update or the push runs
- **THEN** nothing is pushed, the script exits 4, and auto stops

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
