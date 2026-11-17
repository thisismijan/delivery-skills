## ADDED Requirements

### Requirement: Leftover sandbox containers are reaped per run

`sandbox-run.ts reap <repoRoot> <run-id>` SHALL remove every container labelled
with that run and SHALL NOT touch a container without that label. It SHALL
report the containers it removed and those the engine refused, and exit 1 when
any was refused. `/delivery doctor` SHALL list sandbox containers still present,
naming their runs, when a sandbox is configured and usable.

#### Scenario: Containers from a finished run are removed

- **GIVEN** containers labelled for run `run-7` and one labelled for run `run-8`
- **WHEN** `sandbox-run.ts reap` runs for `run-7`
- **THEN** both `run-7` containers are removed
- **AND** the `run-8` container remains

#### Scenario: A refused removal is reported

- **GIVEN** a container for the run that the engine refuses to remove
- **WHEN** `reap` runs
- **THEN** that container is listed as failed and the command exits 1

#### Scenario: Doctor names runs with leftovers

- **GIVEN** a usable sandbox and containers left from two runs
- **WHEN** `/delivery doctor` runs
- **THEN** it reports how many containers remain, names both runs, and names the `reap` command
