## ADDED Requirements

### Requirement: Python import-only units drop unused top-level names

When a mechanical-edit unit is Python import-only, the command SHALL drop unused top-level imported names only when remaining non-import AST is identical. Star imports, nested imports, postponed annotations, and comments on import lines SHALL leave files unchanged and keep live dispatch on `select-model`. The command SHALL NOT dispatch a fast catalogue model.

#### Scenario: Unused Python imports are removed without a worker
- **WHEN** a mechanical import-only unit lists a Python file whose unused top-level imported name can be dropped without touching later statements
- **THEN** the helper rewrites the file and reports `apply: script`

#### Scenario: A Python star import is refused
- **WHEN** a listed Python file contains a star import
- **THEN** the helper writes nothing and reports `apply: select-model`
