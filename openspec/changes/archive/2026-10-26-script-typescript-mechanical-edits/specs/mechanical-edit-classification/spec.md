## ADDED Requirements

### Requirement: TypeScript identifier renames apply through a proven script

When a mechanical-edit unit is a TypeScript identifier rename, the command SHALL apply it with the TypeScript language service only when every reference lives in the listed files, the source name is one symbol, and the target name is unused in those files. Any other case SHALL leave files unchanged and keep live dispatch on `select-model`. A caller-set script flag SHALL NOT count as proof. The command SHALL NOT dispatch a fast catalogue model.

#### Scenario: A complete TypeScript rename is applied without a worker
- **WHEN** a mechanical rename unit lists every TypeScript file that references the identifier, the source name is one symbol, and the target name is unused
- **THEN** the helper rewrites those files and reports `apply: script`

#### Scenario: An incomplete file list leaves files unchanged
- **WHEN** a listed TypeScript file exports the identifier and another project file still references it
- **THEN** the helper writes nothing and reports `apply: select-model`

#### Scenario: A string occurrence is not rewritten
- **WHEN** a listed file contains the source name as a string literal and as an identifier
- **THEN** the helper rewrites only the identifier

#### Scenario: Import-only has no TypeScript script yet
- **WHEN** the unit is mechanical and the operation is import-only
- **THEN** the helper writes nothing and live dispatch stays on `select-model`
