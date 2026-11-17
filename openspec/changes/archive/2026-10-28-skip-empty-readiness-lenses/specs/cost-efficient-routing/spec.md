## ADDED Requirements

### Requirement: Release-readiness lens fan-out is proportional to demonstrated risk

Stage 4 SHALL dispatch no readiness-lens subagents when `review-fanout.ts readiness` returns `empty` or `small`. An empty measured diff SHALL also skip the rollback lens in the main conversation. A small reversible change SHALL still run the rollback lens in the main conversation. Every other change SHALL run the lenses the classification turned on. The helper SHALL refuse malformed input.

#### Scenario: No reviewable code skips readiness lenses
- **WHEN** the measured diff has no reviewable code, classification is complete, the change is reversible, and it touches none of Data, Contract, Config, Auth, or Infra
- **THEN** no readiness-lens subagent is dispatched
- **AND** the main conversation does not run the rollback lens itself

#### Scenario: Small reversible change skips readiness subagents
- **WHEN** a two-file, 40-line, two-way change touches none of the excluded surfaces
- **THEN** no readiness-lens subagent is dispatched
- **AND** the main conversation runs the rollback lens itself

#### Scenario: Risky change retains the classified lenses
- **WHEN** a change touches auth, migrations, a public contract, configuration, infrastructure, or a one-way operation
- **THEN** the helper returns `full`
- **AND** the classified readiness lenses still run
