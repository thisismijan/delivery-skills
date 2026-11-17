# improvement-state

## Purpose

Stores improvement candidates, versions, and rollback copies in one repository-local location with explicit transitions.

## Requirements

### Requirement: Improvement state lives under the target repository's state root
The system SHALL resolve one state root for the target repository: `DELIVERY_STATE_ROOT` when set, otherwise `<target repo>/.delivery/`. Improvement candidates SHALL be kept under `<state root>/candidates/` and recovery copies under `<state root>/versions/`, on desktop and on Cloud alike.

#### Scenario: Candidate is prepared under the state root
- **WHEN** an improvement candidate is prepared for a target repository
- **THEN** its folder is placed under `<target repo>/.delivery/candidates/`
- **AND** nothing is written to a `candidates/` folder beside the installed skill

#### Scenario: Recovery copy is created under the state root
- **WHEN** apply or rollback creates a recovery copy
- **THEN** the copy is placed under `<target repo>/.delivery/versions/`
- **AND** nothing is written to a `versions/` folder beside the installed skill

#### Scenario: State root override applies to both folders
- **WHEN** `DELIVERY_STATE_ROOT` names a directory
- **THEN** candidates resolve under that directory's `candidates/` and recovery copies under its `versions/`

### Requirement: Legacy skill-local state is reported and never installed
Status SHALL report any candidate or version found beside the installed skill, with the state-root path it should be migrated to. Detection SHALL be read-only. A legacy copy SHALL NOT be moved, installed, or treated as eligible for apply or rollback.

#### Scenario: Status reports a leftover candidate
- **WHEN** an old candidate exists in the installed skill's `candidates/` folder and status runs
- **THEN** the report names that candidate and its destination under `<state root>/candidates/`
- **AND** the candidate is not installed
- **AND** no file is moved, copied, or changed

#### Scenario: Status reports a leftover version
- **WHEN** an old recovery copy exists in the installed skill's `versions/` folder and status runs
- **THEN** the report names that copy and its destination under `<state root>/versions/`
- **AND** no file is moved, copied, or changed

#### Scenario: No leftovers
- **WHEN** the installed skill has no `candidates/` or `versions/` entries and status runs
- **THEN** the report lists no legacy entries

### Requirement: Reinstall preserves skill-local improvement folders
Reinstalling the delivery skill SHALL leave existing skill-local `runs`, `candidates` and `versions` content untouched, so leftovers stay visible to status.

#### Scenario: Reinstall keeps leftovers
- **WHEN** the installer runs over a skill folder containing `runs`, `candidates` and `versions` content
- **THEN** that content is unchanged afterwards
