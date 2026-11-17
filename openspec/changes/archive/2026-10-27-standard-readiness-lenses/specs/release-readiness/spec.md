## ADDED Requirements

### Requirement: Readiness lens subagents use the resolved standard model

Every release-readiness lens subagent SHALL use the exact model identifier returned by resolving the `standard` capability against the recorded runtime inventory. The main conversation SHALL still synthesise GO or NO-GO, drop Stage 3 duplicates, keep unverified Critical and High findings blocking, and write the brief. A missing live standard candidate SHALL stop the stage. Fast-tier models SHALL NOT run these lenses.

#### Scenario: Workflow wording is pinned
- **WHEN** the release readiness workflow is read
- **THEN** it names `resolve standard`, says that exact identifier is passed to every lens subagent, says the main conversation still decides GO or NO-GO, and does not dispatch a fast model for those lenses
