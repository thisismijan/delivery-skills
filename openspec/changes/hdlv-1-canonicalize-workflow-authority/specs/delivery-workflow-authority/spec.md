## ADDED Requirements

### Requirement: One declared live source per delivery rule
The delivery skill SHALL declare its live workflow sources (the conductor `SKILL.md`, the auto next-step table `workflows/auto.md`, the ledger spec and the current stage specs) and SHALL declare `workflows/NOTES.md` and `workflows/delivery-orchestrator.md` historical and non-actionable.

#### Scenario: Historical file disagrees with the live conductor
- **WHEN** `/delivery` loads its workflow specifications and a historical file disagrees with the live conductor
- **THEN** only the declared live source is actionable
- **AND** the historical file is marked non-actionable and states that it cannot override the conductor, the auto next-step table or the current stage specs

#### Scenario: Historical files do not claim authority
- **WHEN** a historical file is read
- **THEN** it carries a non-actionable marker pointing at the conductor
- **AND** it makes no claim to be the source of truth for stage behaviour

#### Scenario: Live files do not defer to historical files
- **WHEN** a live workflow file refers to a historical file
- **THEN** it treats that file as reference only and takes no rule from it

### Requirement: Live contracts are independent of historical wording
The delivery contract suite SHALL assert live workflow rules against live files only, and SHALL NOT require wording from historical files.

#### Scenario: A live rule changes
- **WHEN** a live workflow rule changes and its contracts run
- **THEN** they do not require stale duplicate wording from historical files

#### Scenario: Historical wording contradicts live rules
- **WHEN** the suite runs against a skill root whose historical files contradict the live rules
- **THEN** every live contract still passes
