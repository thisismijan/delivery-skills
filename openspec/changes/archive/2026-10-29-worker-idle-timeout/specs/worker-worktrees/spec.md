## ADDED Requirements

### Requirement: Idle parallel workers are stopped from their journal heartbeat
A parallel worker SHALL write its journal at every step boundary and around
any long command. `worker-watch.ts` SHALL report a worker idle when its
journal, or its dispatch when there is no journal, is older than
`workerIdleMinutes` (default 20). Auto SHALL stop an idle worker's key,
close its worktree, ignore its later writes, and keep its siblings running.

#### Scenario: Recent heartbeat
- **WHEN** a worker's journal was written within the idle limit
- **THEN** it is reported active

#### Scenario: Silent worker
- **WHEN** a worker's journal has not changed for longer than the idle limit
- **THEN** it is reported idle, the command exits 3, and auto stops only that key as `[stopped: worker idle]`

#### Scenario: No journal yet
- **WHEN** a worker has written no journal
- **THEN** its idle time counts from its dispatch

#### Scenario: Malformed input
- **WHEN** the dispatch list is empty, names a key twice, has a malformed key or time, or the limit is not a positive whole number
- **THEN** the command fails and reports no worker as active
