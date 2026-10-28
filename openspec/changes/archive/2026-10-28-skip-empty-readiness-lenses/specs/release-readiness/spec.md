## ADDED Requirements

### Requirement: Empty and small diffs skip readiness-lens subagents

Release readiness SHALL measure the pinned diff with `review-fanout.ts measure` and SHALL take `review-fanout.ts readiness` as the dispatch plan. An `empty` mode SHALL dispatch no lens subagent and SHALL NOT run the rollback lens in the main conversation. A `small` mode SHALL dispatch no lens subagent and SHALL run the rollback lens in the main conversation. A `full` mode SHALL run the lenses the classification turned on. Malformed input SHALL stop the stage.

#### Scenario: Workflow wording is pinned
- **WHEN** the release readiness workflow is read
- **THEN** it names `review-fanout.ts readiness`, says `empty` skips the rollback lens in this conversation, says `small` runs that lens here, and says a non-zero exit stops the stage
