## ADDED Requirements

### Requirement: Sandbox reaping is proven on a real engine

Where a supported engine and a small local image are present, a test SHALL
start labelled containers for two runs, reap one run, and show that only that
run's containers are gone. Without an engine it SHALL be skipped with that
reason, unless the engine is marked required, when it SHALL fail.

#### Scenario: An engine is present

- **GIVEN** an engine and image on the machine
- **WHEN** the test runs
- **THEN** reaping one run removes only that run's containers

#### Scenario: No engine

- **GIVEN** no engine
- **WHEN** the test runs
- **THEN** it is skipped with a reason naming the missing engine
