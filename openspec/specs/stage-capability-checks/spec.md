# stage-capability-checks

## Purpose

Applies capability checks for the current stage instead of a global host contract that stops unused later stages.

## Requirements

### Requirement: Capabilities block only the stage that needs them
The delivery skill SHALL block a stage only on the capabilities that stage needs, as named by the `Needed by` column of the Capabilities table.

#### Scenario: Later-stage capabilities are unavailable during an early stage
- **WHEN** the deployed environment and skill evaluation checks fail and the stage is draft
- **THEN** the check allows the stage to continue
- **AND** those probes are not required to run

#### Scenario: A capability the stage needs is missing
- **WHEN** a capability needed by the current stage fails its check
- **THEN** the stage stops
- **AND** the stop names the capability, the stages it blocks, and its fix

### Requirement: Jira is checked with a real read
When a stage needs Jira, the check SHALL call the Jira probe and require it to return the ticket it read. It SHALL NOT report success otherwise.

#### Scenario: The Jira read fails
- **WHEN** a stage needs Jira and the Jira read fails
- **THEN** the stage stops

#### Scenario: Jira success is claimed without a read
- **WHEN** a stage needs Jira and the probe returns no ticket
- **THEN** the stage stops instead of reporting success

#### Scenario: The Jira probe is always called when needed
- **WHEN** a stage needs Jira
- **THEN** the Jira probe is called exactly once

### Requirement: Capabilities are checked again at each stage boundary
The delivery skill SHALL run the capability check when each stage begins, so a capability that becomes necessary later is checked then.

#### Scenario: A capability becomes necessary later
- **WHEN** a stage begins that needs a capability the previous stage did not
- **THEN** that capability is checked at that point

#### Scenario: Auto does not check everything up front
- **WHEN** auto starts at an early stage
- **THEN** it checks only what that stage needs and checks again at the next stage
