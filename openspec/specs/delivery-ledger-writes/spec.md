# delivery-ledger-writes

## Purpose

Makes every ledger mutation durable, generation-checked, and conflict-safe so concurrent writers cannot overwrite each other.

## Requirements

### Requirement: Concurrent writers cannot overwrite each other
Every ledger mutation SHALL go through the durable writer, which writes only when the ledger's current generation equals the generation the writer read, and increments it exactly once. A stale or contended write SHALL fail with a distinct concurrency conflict.

#### Scenario: Two writers read the same generation
- **WHEN** two writers read the same generation and both write
- **THEN** exactly one write succeeds
- **AND** the other stops with a concurrency conflict
- **AND** the ledger holds only the winning writer's content at the next generation

#### Scenario: A write is attempted while another holds the lock
- **WHEN** a lock is held by a live owner
- **THEN** the write stops with a concurrency conflict and the ledger is unchanged

### Requirement: Existing ledgers resume without conversion
The durable writer SHALL accept an existing valid ledger on first use, including one with no `Generation` header, which counts as generation 0.

#### Scenario: Legacy ledger without a generation header
- **WHEN** the durable writer first updates a ledger that has no `Generation` header
- **THEN** the write succeeds with the header stamped
- **AND** the ledger content is otherwise preserved
- **AND** a following write at the new generation succeeds

#### Scenario: Ledger in the current format
- **WHEN** the durable writer first updates a ledger that has a `Generation` header
- **THEN** the write succeeds with no manual conversion

### Requirement: Abandoned locks are recovered explicitly
A lock SHALL record its owner's process id, host, and timestamp. Recovery SHALL be an explicit step that clears a lock only when its owner is no longer active, and reports what it cleared. A write SHALL never clear a lock itself.

#### Scenario: Owner is no longer active
- **WHEN** a lock's recorded owner is no longer active and recovery is run
- **THEN** the lock is cleared and the recovery names the owner it cleared
- **AND** a following write succeeds

#### Scenario: Write meets an abandoned lock
- **WHEN** a write meets a lock whose owner is no longer active and recovery has not been run
- **THEN** the write stops with a concurrency conflict that points to recovery

#### Scenario: Owner is still active
- **WHEN** recovery is run against a lock whose owner is active, or whose host cannot be checked
- **THEN** the lock is left in place and recovery reports why

### Requirement: The workflows require the durable writer
The delivery ledger workflow SHALL name the durable writer and its explicit recovery step as the only way to mutate a ledger, and SHALL treat a concurrency conflict as a terminal stop.

#### Scenario: Workflow documents match the writer
- **WHEN** the delivery workflow documents are read
- **THEN** they name the writer and recovery commands that the store implements
- **AND** they state that a conflict is a terminal stop
