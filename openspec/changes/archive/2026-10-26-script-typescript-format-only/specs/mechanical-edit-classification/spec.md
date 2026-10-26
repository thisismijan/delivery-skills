## ADDED Requirements

### Requirement: TypeScript format-only units apply through document formatting

When a mechanical-edit unit is TypeScript format-only, the command SHALL apply language-service document formatting on the listed files only when identifier and literal structure stays identical. Any other case SHALL leave files unchanged and keep live dispatch on `select-model`. The command SHALL NOT dispatch a fast catalogue model.

#### Scenario: A layout-only TypeScript file is formatted without a worker
- **WHEN** a mechanical format-only unit lists a TypeScript file whose tokens can be spaced without renaming identifiers or changing literals
- **THEN** the helper rewrites the file or reports no file changes, and reports `apply: script`
