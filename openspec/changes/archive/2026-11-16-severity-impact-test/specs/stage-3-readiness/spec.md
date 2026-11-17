## ADDED Requirements

### Requirement: Blocking severity is capped by demonstrated impact
The code review SHALL rate a finding no higher than the impact its evidence
shows. A finding whose concrete damage cannot be stated SHALL be Low at most.
Medium or above SHALL need both a named trigger and a stated consequence. A
finding that only weakens a control SHALL rate lower than one that defeats it.

#### Scenario: Damage that cannot be stated
- **WHEN** a candidate's harm cannot be described as what breaks, for whom, and on what input
- **THEN** it is not rated Medium or higher, so it does not block readiness on its own
