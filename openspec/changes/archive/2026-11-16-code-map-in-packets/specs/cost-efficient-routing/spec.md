## ADDED Requirements

### Requirement: Execute workers receive a capped code map
`/execute` SHALL build, without a model, a map of the exported top-level symbols
in the change's affected areas and include it in the test-writer and implementer
packets. The map SHALL stay within a fixed size cap and say how many files it
left out. The holdout review packet SHALL NOT include it.

#### Scenario: An execute dispatch
- **WHEN** `/execute` builds the test-writer and implementer packets
- **THEN** each includes the code map within its size cap

#### Scenario: A large area
- **WHEN** the affected areas export more than the cap can hold
- **THEN** the map stops at the cap and names how many files it left out
