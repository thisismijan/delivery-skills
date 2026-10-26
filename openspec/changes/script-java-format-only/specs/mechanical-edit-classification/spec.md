## ADDED Requirements

### Requirement: Java format-only units apply through token round-trip

When a mechanical-edit unit is Java format-only, the command SHALL re-space listed files only when identifier, number, string, operator, and comment tokens stay identical. Any other case SHALL leave files unchanged and keep live dispatch on `select-model`. The command SHALL NOT dispatch a fast catalogue model.

#### Scenario: A layout-only Java file is formatted without a worker
- **WHEN** a mechanical format-only unit lists a Java file whose tokens can be spaced without renaming identifiers or changing literals
- **THEN** the helper rewrites the file or reports no file changes, and reports `apply: script`
