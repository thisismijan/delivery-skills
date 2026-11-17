## ADDED Requirements

### Requirement: A scripted skip is recorded as an avoided worker

When a factory command does not dispatch a named worker because a script
already proved the outcome, it SHALL persist a skip record naming that
worker and a human reason. The record SHALL NOT include token, cost, or
wall-time estimates. Persistence SHALL refuse an unknown worker name or a
duplicate skip id for the same run.

#### Scenario: A mechanical apply records the avoided execute workers
- **WHEN** `apply-mechanical-edit.ts` reports `apply` is `script`
- **THEN** skip records name `test-writer` and `implementer`
- **AND** those records contain no token or cost fields

#### Scenario: An unknown worker is refused
- **WHEN** persist is given a worker name outside the closed list
- **THEN** it writes nothing and exits non-zero

### Requirement: The run scorecard counts avoided workers without pricing them

The run scorecard SHALL count persisted skip records for that run and
SHALL print the avoided-worker total beside measured usage. It SHALL
state that token savings are not estimated. A run that has skip records
and no routing observations SHALL still produce a scorecard.

#### Scenario: Skips appear on the scorecard
- **WHEN** a run has two skip records and measured usage from workers that ran
- **THEN** the scorecard reports two workers avoided
- **AND** the text does not invent tokens saved

#### Scenario: A skip-only run still scores
- **WHEN** a run has skip records and no routing observations
- **THEN** the scorecard still prints the avoided-worker count

### Requirement: Skip recording does not depend on diagnostic profiling

Skip persist and the avoided-worker scorecard line SHALL run when
`routingProfiling` is `off`. Turning profiling `always` SHALL NOT change
which workers are skipped.

#### Scenario: Profiling off still records skips
- **WHEN** a scripted skip fires and `routingProfiling` is `off`
- **THEN** the skip record is still persisted
- **AND** the scorecard still counts it
