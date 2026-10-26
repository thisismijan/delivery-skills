## ADDED Requirements

### Requirement: Unscripted mechanical-edit units have a representative scoring pack

Mechanical-edit units that scripts cannot prove SHALL be listed as representative fixtures for later fast-model scoring. Scoring an exact candidate on that pack SHALL NOT change live catalogue availability. Units a script already applies SHALL NOT be included.

#### Scenario: Unscripted fixtures keep today's worker
- **WHEN** the scoring pack's fixtures are applied through the mechanical-edit helper
- **THEN** each fixture reports `apply: select-model`

#### Scenario: Haiku scores do not promote
- **WHEN** five or more representative-run scores for Haiku on that pack clear the 90 percent bar with no critical misses and there is no operator promotion approval
- **THEN** Haiku remains evaluation-only

#### Scenario: Scripted units are omitted
- **WHEN** the pack is listed
- **THEN** it does not include units a proven script already applies
