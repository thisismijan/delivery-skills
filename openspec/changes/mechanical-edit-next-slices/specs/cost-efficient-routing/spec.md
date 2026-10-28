## MODIFIED Requirements

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

#### Scenario: A JavaScript rename is applied by script
- **WHEN** the listed files are JavaScript and the rename is proven
- **THEN** `apply-mechanical-edit.ts` reports `apply` is `script`
- **AND** no test-writer or implementer is dispatched

#### Scenario: A unique Python local is applied by script
- **WHEN** the listed files hold one Python parameter or local binding and no attribute, exec, or eval use of that name
- **THEN** `apply-mechanical-edit.ts` reports `apply` is `script`

#### Scenario: A unique Java field is applied by script
- **WHEN** the listed files hold one Java field and no method or type of that name
- **THEN** `apply-mechanical-edit.ts` reports `apply` is `script`

#### Scenario: A Java type rename moves the matching file
- **WHEN** a unique Java type rename is proven and a listed file is named `from.java`
- **THEN** `apply-mechanical-edit.ts` writes `to.java` and removes `from.java`
- **AND** `apply` is `script`

#### Scenario: A unique TypeScript missing import is applied by script
- **WHEN** import-only runs and the language service offers exactly one missing-import fix in listed files
- **THEN** `apply-mechanical-edit.ts` reports `apply` is `script`

#### Scenario: A repo formatter that changes names stays unscripted
- **WHEN** format-only invokes a repo Prettier, Ruff, or google-java-format binary
- **AND** the result would change names or literals
- **THEN** `apply` is `select-model`
- **AND** the listed files are unchanged
