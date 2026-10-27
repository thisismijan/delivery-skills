## ADDED Requirements

### Requirement: Release-readiness lens candidates use the standard tier

Every Stage 4 readiness lens worker SHALL use the exact resolved standard-tier model. The main conversation SHALL independently synthesise the GO or NO-GO verdict from those findings.

#### Scenario: A readiness lens reports a finding
- **WHEN** a rollback, compatibility, security, or operability lens returns a finding
- **THEN** the standard-tier model identity is recorded for that worker
- **AND** the main conversation decides whether it blocks release
