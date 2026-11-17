## ADDED Requirements

### Requirement: A skill change is judged on repeated alternating runs

The paired evaluation command SHALL accept only evidence with 3 runs per arm,
or 5 after a close call, with the arms alternating which runs first and every
run sharing its controls and its arm's managed tree. It SHALL apply every
quality gate to every run. It SHALL judge utility on the ratio of the arms'
median utilities, and on most runs clearing the 90 percent bar.

#### Scenario: A clear result after three runs per arm

- **GIVEN** three runs per arm whose median ratio is at least 0.05 from the bar and agrees with the run count
- **WHEN** the evaluation runs
- **THEN** it passes or fails without asking for more runs

#### Scenario: A close call extends to five runs and no further

- **GIVEN** three runs per arm whose median ratio is within 0.05 of the bar
- **WHEN** the evaluation runs
- **THEN** it exits 3 and asks for two more runs per arm
- **AND** an evaluation of five runs per arm always decides

#### Scenario: One run per arm is refused

- **GIVEN** evidence with one baseline run and one candidate run
- **WHEN** the evaluation command runs
- **THEN** it exits non-zero without writing a result

#### Scenario: A hard gate fails without extending

- **GIVEN** a close call in which one candidate run has a Critical miss
- **WHEN** the evaluation runs
- **THEN** it fails and names that run
