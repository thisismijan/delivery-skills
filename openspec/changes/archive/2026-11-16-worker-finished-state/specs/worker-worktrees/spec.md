## ADDED Requirements

### Requirement: A worker that finished but did not exit is reconciled, not stopped as idle

`worker-watch.ts` SHALL report a worker as finished when its own row in its
journal carries a status after which a worker has nothing left to do
(`[go !N]`, `[stopped: <reason>]`, or a status that follows landing), whatever
its idle time. Auto SHALL reconcile a finished worker from its journal, git,
and forge, then end it, and SHALL NOT treat it as idle or redo its work.

#### Scenario: A terminal journal past the idle limit

- **GIVEN** a worker whose journal row reads `[go !4]` and was last written 45 minutes ago
- **AND** an idle limit of 20 minutes
- **WHEN** `worker-watch.ts` runs
- **THEN** the worker is listed as finished, not idle
- **AND** the coordinator reconciles its result and ends it

#### Scenario: A worker still mid-run is unchanged

- **GIVEN** a worker whose journal row reads `[ready !6]` and was last written 45 minutes ago
- **WHEN** `worker-watch.ts` runs with a 20 minute limit
- **THEN** the worker is listed as idle
