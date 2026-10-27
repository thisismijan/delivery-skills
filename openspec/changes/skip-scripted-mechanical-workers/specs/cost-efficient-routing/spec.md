## ADDED Requirements

### Requirement: A scripted mechanical-edit unit does not start execute workers

When `/execute` applies a mechanical-edit unit and `apply` is `script`, it SHALL NOT dispatch the test-writer or the implementer, and SHALL NOT run a red gate. It SHALL still run green, lint, and typecheck, then holdout. A unit that is not scripted SHALL keep tests-first and the implementer.

#### Scenario: Scripted apply skips the test-writer
- **WHEN** `apply-mechanical-edit.ts` reports `apply` is `script`
- **THEN** no test-writer is dispatched
- **AND** no red gate runs
- **AND** no implementer is dispatched
- **AND** green, lint, typecheck, and holdout still run

#### Scenario: An unscripted unit keeps tests-first
- **WHEN** the unit is `not-mechanical` or `apply` is `select-model`
- **THEN** the test-writer, red gate, and implementer still run
