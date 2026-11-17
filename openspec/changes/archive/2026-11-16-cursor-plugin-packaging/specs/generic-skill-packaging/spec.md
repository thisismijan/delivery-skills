## ADDED Requirements

### Requirement: The Cursor plugin runs judging agents read-only

The Cursor plugin install SHALL carry the pack's skills, runtime, and one agent
per factory agent. It SHALL declare `readonly: true` for every agent whose
declared tools cannot write files or run commands. The runtime SHALL dispatch
a host-provided subagent by the named agent's exact name. The existing install
SHALL keep working.

#### Scenario: The holdout reviewer under the plugin

- **GIVEN** the plugin installed
- **WHEN** a skill dispatches the holdout reviewer
- **THEN** Cursor runs the plugin's `holdout-reviewer` agent, which is declared read-only

#### Scenario: Writing agents stay writable

- **GIVEN** the plugin installed
- **WHEN** the test writer or implementer is dispatched
- **THEN** its agent is not declared read-only

#### Scenario: The plain install

- **GIVEN** the existing Cursor install
- **WHEN** it runs
- **THEN** it installs the same skills and runtime as before
