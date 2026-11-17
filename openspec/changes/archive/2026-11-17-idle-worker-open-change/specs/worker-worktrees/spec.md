## ADDED Requirements

### Requirement: An idle worker's proven change is kept for review

When a worker is stopped as idle, auto SHALL check the key's open changes. When
exactly one is open and its head appears in the worker's journal or under a
passing green gate, the key SHALL record that change and resume at review on
the next run. Otherwise the key SHALL stay stopped as idle.

#### Scenario: An open draft change at a green head

- **GIVEN** an idle worker whose branch has one open draft change at a head its green gate artifact names
- **WHEN** the coordinator handles the idle report
- **THEN** the key records that change and the next run resumes at review

#### Scenario: No open change

- **GIVEN** an idle worker with no open change
- **WHEN** the coordinator handles the idle report
- **THEN** the key is `[stopped: worker idle]`
