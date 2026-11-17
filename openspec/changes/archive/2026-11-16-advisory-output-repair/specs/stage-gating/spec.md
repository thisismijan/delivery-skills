## ADDED Requirements

### Requirement: Advisory output gets one repair turn and gates stay strict
Every subagent output SHALL be listed as gating or advisory. A gating output
that fails to parse SHALL fail closed at once with no repair. An advisory output
that fails to parse SHALL get one repair turn from the same subagent, doing no
new work, and a second failure SHALL fail closed. An output not on the list
SHALL be treated as gating.

#### Scenario: Malformed lens candidates
- **WHEN** a review lens returns a report that cannot be parsed
- **THEN** that lens gets one repair turn, and a second failure stops the review

#### Scenario: A malformed gating verdict
- **WHEN** a feasibility or holdout verdict cannot be parsed
- **THEN** the run fails closed at once
