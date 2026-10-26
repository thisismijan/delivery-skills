## ADDED Requirements

### Requirement: Python identifier renames apply through a proven script

When a mechanical-edit unit is a Python identifier rename, the command SHALL apply it with CPython's tokenizer and AST only when the listed files contain exactly one function or class definition of the source name, every remaining name token lives in those files, and the target name is unused. Any other case SHALL leave files unchanged and keep live dispatch on `select-model`. The command SHALL NOT dispatch a fast catalogue model.

#### Scenario: A complete Python rename is applied without a worker
- **WHEN** a mechanical rename unit lists every Python file that references the identifier, the listed files contain one function or class definition of that name, and the target name is unused
- **THEN** the helper rewrites those files and reports `apply: script`

#### Scenario: An incomplete Python file list leaves files unchanged
- **WHEN** a listed Python file defines the identifier and another project file still references it
- **THEN** the helper writes nothing and reports `apply: select-model`

#### Scenario: A Python string occurrence is not rewritten
- **WHEN** a listed file contains the source name as a string literal and as an identifier
- **THEN** the helper rewrites only the identifier
