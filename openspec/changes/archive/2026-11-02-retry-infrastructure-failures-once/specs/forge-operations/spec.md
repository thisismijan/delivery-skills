## ADDED Requirements

### Requirement: Failed-job evidence is bound to the change head
The `failures` operation SHALL return the newest pipeline at the change's
current head, or `available: false` when the newest pipeline is not at that
head. Each failed job SHALL carry its id, name, forge failure reason when
known, the number of times a job of that name has run in the pipeline, and
the end of its log when the forge returns it. A merge train pipeline SHALL
say how many train pipelines in a row have failed for the head.

#### Scenario: A job retried once
- **WHEN** a job has failed, been retried, and failed again in the pipeline
- **THEN** its failed-job evidence has attempt 2

#### Scenario: The head has moved
- **WHEN** `failures` is asked for a head the change no longer has
- **THEN** it fails instead of returning evidence for another revision

### Requirement: CI is retried once, and only for infrastructure
The `retry` operation SHALL retry a failed pipeline only when the frozen run
contract checks and sets `ciRetry.infrastructure` to 1, every failed job is
classified as infrastructure, no failed job is a deploy job, and nothing has
already been retried for the head. Otherwise it SHALL stop with plain reasons
for the operator.

#### Scenario: A first infrastructure failure
- **WHEN** a runner failure fails the pipeline and the contract allows one retry
- **THEN** that job is retried and the result names it

#### Scenario: A repeat after the retry
- **WHEN** the same infrastructure failure happens again after its retry
- **THEN** the run stops and goes to the operator

#### Scenario: A test failure
- **WHEN** a test job fails and its log shows no infrastructure cause
- **THEN** nothing is retried, whatever the contract allows

#### Scenario: No retry policy
- **WHEN** the run contract has no `ciRetry`
- **THEN** nothing is retried and the run stops for the operator

### Requirement: A retry runs through the adapter and re-adds a failed train
The `retry` operation SHALL run only through the executable adapter, never
through session tools. For a failed merge train pipeline it SHALL re-add the
change to the train at the guarded head instead of retrying the train's jobs.

#### Scenario: Session tools
- **WHEN** a retry is planned or normalized for session tools
- **THEN** it is refused

#### Scenario: A failed merge train
- **WHEN** a merge train pipeline fails for the first time on infrastructure
- **THEN** the change is re-added to the merge train
