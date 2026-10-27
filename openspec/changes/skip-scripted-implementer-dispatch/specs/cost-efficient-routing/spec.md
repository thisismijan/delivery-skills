## ADDED Requirements

### Requirement: A scripted apply at implement time does not start the implementer

When `/execute` reaches implementation and `apply-mechanical-edit.ts` reports `apply` is `script`, it SHALL NOT dispatch the implementer. It SHALL continue at the green gates. A unit that is not scripted SHALL still dispatch the implementer.

#### Scenario: Scripted apply skips the implementer at implement time
- **WHEN** step 7's `apply-mechanical-edit.ts` reports `apply` is `script`
- **THEN** no implementer is dispatched
- **AND** green, lint, typecheck, and holdout still run

#### Scenario: An unscripted implement step still uses the implementer
- **WHEN** the unit is `not-mechanical` or `apply` is `select-model`
- **THEN** the implementer still runs
