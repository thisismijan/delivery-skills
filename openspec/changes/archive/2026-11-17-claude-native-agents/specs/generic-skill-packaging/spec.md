## ADDED Requirements

### Requirement: Claude Code runs the factory agents natively

The Claude Code adapter SHALL install every factory agent as a native subagent
that keeps its declared tools. It SHALL replace only agents it installed and
SHALL NOT replace an agent of the same name that it did not install.

#### Scenario: The holdout reviewer under Claude Code

- **GIVEN** the Claude Code adapter installed
- **WHEN** a skill dispatches the holdout reviewer
- **THEN** the host runs the native `holdout-reviewer` agent with tools Read, Grep, and Glob only

#### Scenario: An unmanaged agent

- **GIVEN** an agent the pack did not install, with another name
- **WHEN** the adapter reinstalls
- **THEN** that agent is unchanged
