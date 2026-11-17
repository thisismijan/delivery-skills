## MODIFIED Requirements

### Requirement: A scripted mechanical-edit unit does not start execute workers

#### Scenario: A unique Python missing import is applied by script
- **WHEN** import-only runs and exactly one repository Python file exports a used unbound name
- **THEN** `apply-mechanical-edit.ts` reports `apply` is `script`
- **AND** the listed file gains that import

#### Scenario: An ambiguous Python missing import is not added
- **WHEN** import-only runs and two repository Python files export the same used name
- **THEN** `apply` is `script`
- **AND** the listed file does not gain that import

#### Scenario: A unique Java missing import is applied by script
- **WHEN** import-only runs and exactly one public Java type matches a used simple name
- **THEN** `apply-mechanical-edit.ts` reports `apply` is `script`
- **AND** the listed file gains that import

#### Scenario: An ambiguous Java missing import is not added
- **WHEN** import-only runs and two public Java types share the used simple name
- **THEN** `apply` is `script`
- **AND** the listed file does not gain that import
