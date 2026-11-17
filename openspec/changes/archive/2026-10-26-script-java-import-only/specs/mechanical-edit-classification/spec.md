## ADDED Requirements

### Requirement: Java import-only units drop unused single-type imports

When a mechanical-edit unit is Java import-only, the command SHALL drop unused single-type import lines only when remaining identifier tokens outside those lines stay identical. Star imports and unprovable import forms SHALL leave files unchanged and keep live dispatch on `select-model`. The command SHALL NOT dispatch a fast catalogue model.

#### Scenario: Unused Java imports are removed without a worker
- **WHEN** a mechanical import-only unit lists a Java file whose unused single-type import can be dropped without touching later identifiers
- **THEN** the helper rewrites the file and reports `apply: script`

#### Scenario: A Java star import is refused
- **WHEN** a listed Java file contains a star import
- **THEN** the helper writes nothing and reports `apply: select-model`
