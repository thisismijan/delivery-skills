## ADDED Requirements

### Requirement: Java type renames apply through a proven script

When a mechanical-edit unit is a Java type rename, the command SHALL apply it only when the listed files contain exactly one class, interface, enum, or record declaration of the source name, every remaining identifier token lives in those files, and the target name is unused. Any other case SHALL leave files unchanged and keep live dispatch on `select-model`. The command SHALL NOT dispatch a fast catalogue model.

#### Scenario: A complete Java type rename is applied without a worker
- **WHEN** a mechanical rename unit lists every Java file that references the type, the listed files contain one type declaration of that name, and the target name is unused
- **THEN** the helper rewrites those files and reports `apply: script`

#### Scenario: An incomplete Java file list leaves files unchanged
- **WHEN** a listed Java file declares the type and another project file still references it
- **THEN** the helper writes nothing and reports `apply: select-model`

#### Scenario: A Java string occurrence is not rewritten
- **WHEN** a listed file contains the source name as a string literal and as an identifier
- **THEN** the helper rewrites only the identifier
