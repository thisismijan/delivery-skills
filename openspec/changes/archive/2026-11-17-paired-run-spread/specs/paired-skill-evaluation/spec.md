## ADDED Requirements

### Requirement: Run-to-run spread is recorded and reported

Every repeated paired evaluation that decides or extends SHALL append its
per-run utilities and decision with a task class. A report SHALL show, per
task class, the largest and median deviation of one run's ratio from its
evaluation's median ratio, how many evaluations the current margin extended,
and a suggested margin. It SHALL NOT change the margin.

#### Scenario: Recorded evaluations

- **GIVEN** three recorded evaluations
- **WHEN** the report runs
- **THEN** it prints each task class's spread, its extension count at 0.05, and a suggested margin

#### Scenario: No evidence

- **GIVEN** no recorded evaluations
- **WHEN** the report runs
- **THEN** it says there is no evidence and suggests nothing
