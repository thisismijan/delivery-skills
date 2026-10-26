## ADDED Requirements

### Requirement: Python format-only units apply through tokenize round-trip

When a mechanical-edit unit is Python format-only, the command SHALL re-space listed files with CPython's tokenizer only when identifier, number, string, operator, and comment tokens stay identical. Any other case SHALL leave files unchanged and keep live dispatch on `select-model`. The command SHALL NOT dispatch a fast catalogue model.

#### Scenario: A layout-only Python file is formatted without a worker
- **WHEN** a mechanical format-only unit lists a Python file whose tokens can be spaced without renaming identifiers or changing literals
- **THEN** the helper rewrites the file or reports no file changes, and reports `apply: script`
