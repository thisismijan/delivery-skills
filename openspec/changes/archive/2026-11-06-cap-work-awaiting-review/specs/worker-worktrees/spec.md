## ADDED Requirements

### Requirement: Auto starts no more work while the operator's queue is full
The ready wave SHALL count the ledger's open changes, every key with a change
not yet merged, including stopped and waiting ones, plus each live worker.
When that count reaches `maxAwaitingReview`, it SHALL dispatch no new work and
report that it held work for review. Auto SHALL record the hold, keep working
the open changes, and wait on a person when only held keys remain. It SHALL
NOT raise the limit itself.

#### Scenario: A full queue
- **WHEN** five changes wait for the operator and the limit is five
- **THEN** no new worker starts and the held keys stay queued

#### Scenario: Live workers
- **WHEN** three changes wait, one worker is building, and the limit is five
- **THEN** only one more worker starts

#### Scenario: An unreadable ledger
- **WHEN** the Keys table is missing or names a change it cannot read
- **THEN** the ready wave fails instead of guessing the count
