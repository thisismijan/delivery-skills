## ADDED Requirements

### Requirement: The readiness brief shows decisions and what the checks leave open
The release-readiness brief SHALL always include "Decisions to know about" and
"What the checks do not prove", taken from the change description and extended
with what later rounds decided and what the stage's own checks leave open. The
second section SHALL NOT be empty. Review lenses SHALL receive the listed
decisions as choices to challenge.

#### Scenario: A GO brief
- **WHEN** readiness issues a GO
- **THEN** the brief still names what the passing checks do not prove

#### Scenario: A decision made while answering comments
- **WHEN** a fix for a review comment chose a behaviour the spec did not state
- **THEN** the brief lists it under decisions to know about
