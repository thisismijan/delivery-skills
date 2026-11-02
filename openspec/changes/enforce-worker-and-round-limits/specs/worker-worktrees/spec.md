## ADDED Requirements

### Requirement: The parallel cap counts workers already running
`config.ts ready-wave` SHALL count the workers its `dispatch.json` shows
without `finishedAt` against `maxParallelWorktrees` and SHALL dispatch only the
room left. It SHALL refuse a key that already has a running worker.

#### Scenario: Cap already reached
- **WHEN** four workers are running at a cap of four and a fifth key is ready
- **THEN** nothing is dispatched and the key stays queued

#### Scenario: Finished workers
- **WHEN** a worker has `finishedAt`
- **THEN** it does not count against the cap and is not watched for idleness
