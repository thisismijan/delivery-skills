## ADDED Requirements

### Requirement: Classification and the bar check start from the diff scan

Release readiness SHALL run the diff scan on the pinned base and head before classifying the change and checking the bar. Every scanned surface, one-way signal, and lowered-bar hit SHALL be kept. The model MAY add marks it proves from the diff and SHALL NOT remove scanned ones. A non-zero scan exit SHALL stop the stage.

#### Scenario: Workflow wording is pinned
- **WHEN** the release readiness workflow is read
- **THEN** it names the diff scan command, says scanned marks are never removed, and says a non-zero exit stops the stage
