# ledger-transitions

## Purpose

Classify a delivery command, resume a bare key from reconciled ledger status, and refuse illegal or unknown transitions without changing the ledger.

## Requirements

### Requirement: A bare key resumes from reconciled status
When the operator types a ticket key with no verb, delivery SHALL reconcile real state and select the legal next action from the auto next-step table for that status. It SHALL NOT start a ticket span from draft through release readiness.

#### Scenario: Existing ledger with a drafted ticket
- **WHEN** `/delivery <KEY>` runs and the reconciled status is `[drafted]`
- **THEN** the selected action is execute
- **AND** it does not also run review or release readiness in the same step

#### Scenario: Existing ledger ready for release
- **WHEN** `/delivery <KEY>` runs and the reconciled status is `[ready !N]`
- **THEN** the selected action is release readiness

#### Scenario: Existing ledger waiting on review comments
- **WHEN** `/delivery <KEY>` runs and the reconciled status is `[reviewed-blocked !N]`
- **THEN** the selected action is address comments

### Requirement: An explicit verb runs only that step
An explicit lifecycle verb SHALL run only the named step, and only when that step is legal for the reconciled status.

#### Scenario: Legal execute after draft
- **WHEN** `/delivery execute <KEY>` runs and the reconciled status is `[drafted]`
- **THEN** only execute runs

#### Scenario: Legal draft after groom
- **WHEN** `/delivery draft <KEY>` runs and the reconciled status is `[groomed]`
- **THEN** only draft runs

### Requirement: Illegal and unknown transitions do not change the ledger
An explicit verb that is not the legal next action for the reconciled status, or an unknown command, SHALL stop. The durable ledger writer SHALL NOT be called.

#### Scenario: Execute requested while already ready
- **WHEN** `/delivery execute <KEY>` runs and the reconciled status is `[ready !N]`
- **THEN** delivery stops
- **AND** the ledger writer is not called

#### Scenario: Unknown command
- **WHEN** `/delivery` is given a command word that is not a known verb or a ticket key
- **THEN** delivery stops
- **AND** the ledger writer is not called

#### Scenario: Nothing left to run
- **WHEN** `/delivery <KEY>` runs and the reconciled status has no next action in the table
- **THEN** delivery stops
- **AND** the ledger writer is not called
