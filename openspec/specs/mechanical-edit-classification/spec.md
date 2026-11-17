# mechanical-edit-classification

## Purpose

Classifies a bounded edit as mechanical or not from a structured payload, without asking the worker that would apply it.

## Requirements

### Requirement: Mechanical edits are structured units

A mechanical-edit unit SHALL name one operation (`rename`, `import-only`, or `format-only`), the identifiers or files it touches, and whether existing tests plus compile are the verification. Free-text findings, ticket prose, or a worker's claim SHALL NOT be treated as a complete unit.

#### Scenario: A rename unit is complete
- **WHEN** the payload names `rename`, a from-identifier, a to-identifier, and at least one file
- **THEN** classification may proceed

#### Scenario: Free text is not a unit
- **WHEN** the only input is a holdout finding string such as "rename the helper"
- **THEN** classification fails closed as incomplete, not mechanical

### Requirement: Classification is deterministic and fail-closed

A deterministic helper SHALL classify a complete unit as `mechanical` only when every mechanical condition holds. Incomplete, unknown, or unsafe input SHALL classify as `not-mechanical`. The applying worker SHALL NOT classify the unit.

#### Scenario: A local rename with strong verification is mechanical
- **WHEN** the unit is `rename`, reversible, local, known-pattern, strongly verified, and touches none of auth, migration, concurrency, or distributed-state
- **THEN** the helper returns `mechanical`

#### Scenario: A public-contract rename is not mechanical
- **WHEN** the unit's surfaces include a public contract
- **THEN** the helper returns `not-mechanical`

#### Scenario: Unknown operation fails closed
- **WHEN** the operation is missing or not one of the allowed values
- **THEN** classification fails closed rather than guessing

#### Scenario: The worker does not choose the tier
- **WHEN** an implementer or comment-fix worker is about to run
- **THEN** the command classifies the unit before dispatch and does not ask that worker whether the work is menial

### Requirement: Scripted apply is preferred for mechanical units

When a unit classifies as mechanical and the language can prove an identifier rename, import-only, or format-only patch without a model, the command SHALL apply that scripted path. A language model SHALL NOT be the first apply mechanism for those operations.

#### Scenario: A proven identifier rename uses a script
- **WHEN** a mechanical rename unit can be applied by a language-server or AST refactor
- **THEN** the command applies it without dispatching a model worker

#### Scenario: Script inapplicable keeps the standard worker
- **WHEN** a unit is mechanical but no scripted apply exists for that language
- **THEN** live dispatch stays on the current `select-model` worker until a later fast-model promotion

### Requirement: Unclassified work keeps today's worker

Execute and comment-fix SHALL record the classification. When the unit is `not-mechanical` or incomplete, live dispatch SHALL use the existing standard or frontier worker. This change SHALL NOT dispatch a fast catalogue model.

#### Scenario: Ordinary implement stays on the recorded complexity model
- **WHEN** execute implements a ticket with no mechanical-edit unit
- **THEN** the live worker is still the model `select-model` returns for implement

#### Scenario: A fast model is not dispatched
- **WHEN** a unit classifies as mechanical
- **THEN** no evaluation-only catalogue model is the live worker

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

### Requirement: TypeScript import-only units apply through organize-imports

When a mechanical-edit unit is TypeScript import-only, the command SHALL apply language-service organize-imports on the listed files only when non-import statements stay identical. Any other case SHALL leave files unchanged and keep live dispatch on `select-model`. The command SHALL NOT dispatch a fast catalogue model.

#### Scenario: Unused TypeScript imports are removed without a worker
- **WHEN** a mechanical import-only unit lists a TypeScript file whose unused named import can be removed without touching later statements
- **THEN** the helper rewrites the file and reports `apply: script`

#### Scenario: A non-import rewrite is refused
- **WHEN** organize-imports would change code outside import declarations
- **THEN** the helper writes nothing and reports `apply: select-model`

### Requirement: TypeScript format-only units apply through document formatting

When a mechanical-edit unit is TypeScript format-only, the command SHALL apply language-service document formatting on the listed files only when identifier and literal structure stays identical. Any other case SHALL leave files unchanged and keep live dispatch on `select-model`. The command SHALL NOT dispatch a fast catalogue model.

#### Scenario: A layout-only TypeScript file is formatted without a worker
- **WHEN** a mechanical format-only unit lists a TypeScript file whose tokens can be spaced without renaming identifiers or changing literals
- **THEN** the helper rewrites the file or reports no file changes, and reports `apply: script`

### Requirement: Java method renames apply through a proven script

When a mechanical-edit unit is a Java method rename, the command SHALL apply it only when the listed files contain exactly one method declaration of the source name, no type declaration of that name, every remaining identifier token lives in those files, and the target name is unused. Any other case SHALL leave files unchanged and keep live dispatch on `select-model`. The command SHALL NOT dispatch a fast catalogue model.

#### Scenario: A complete Java method rename is applied without a worker
- **WHEN** a mechanical rename unit lists every Java file that references the method, the listed files contain one method declaration of that name, and the target name is unused
- **THEN** the helper rewrites those files and reports `apply: script`

### Requirement: Python import-only units drop unused top-level names

When a mechanical-edit unit is Python import-only, the command SHALL drop unused top-level imported names only when remaining non-import AST is identical. Star imports, nested imports, postponed annotations, and comments on import lines SHALL leave files unchanged and keep live dispatch on `select-model`. The command SHALL NOT dispatch a fast catalogue model.

#### Scenario: Unused Python imports are removed without a worker
- **WHEN** a mechanical import-only unit lists a Python file whose unused top-level imported name can be dropped without touching later statements
- **THEN** the helper rewrites the file and reports `apply: script`

#### Scenario: A Python star import is refused
- **WHEN** a listed Python file contains a star import
- **THEN** the helper writes nothing and reports `apply: select-model`

### Requirement: Python format-only units apply through tokenize round-trip

When a mechanical-edit unit is Python format-only, the command SHALL re-space listed files with CPython's tokenizer only when identifier, number, string, operator, and comment tokens stay identical. Any other case SHALL leave files unchanged and keep live dispatch on `select-model`. The command SHALL NOT dispatch a fast catalogue model.

#### Scenario: A layout-only Python file is formatted without a worker
- **WHEN** a mechanical format-only unit lists a Python file whose tokens can be spaced without renaming identifiers or changing literals
- **THEN** the helper rewrites the file or reports no file changes, and reports `apply: script`

### Requirement: Java import-only units drop unused single-type imports

When a mechanical-edit unit is Java import-only, the command SHALL drop unused single-type import lines only when remaining identifier tokens outside those lines stay identical. Star imports and unprovable import forms SHALL leave files unchanged and keep live dispatch on `select-model`. The command SHALL NOT dispatch a fast catalogue model.

#### Scenario: Unused Java imports are removed without a worker
- **WHEN** a mechanical import-only unit lists a Java file whose unused single-type import can be dropped without touching later identifiers
- **THEN** the helper rewrites the file and reports `apply: script`

#### Scenario: A Java star import is refused
- **WHEN** a listed Java file contains a star import
- **THEN** the helper writes nothing and reports `apply: select-model`

### Requirement: Java format-only units apply through token round-trip

When a mechanical-edit unit is Java format-only, the command SHALL re-space listed files only when identifier, number, string, operator, and comment tokens stay identical. Any other case SHALL leave files unchanged and keep live dispatch on `select-model`. The command SHALL NOT dispatch a fast catalogue model.

#### Scenario: A layout-only Java file is formatted without a worker
- **WHEN** a mechanical format-only unit lists a Java file whose tokens can be spaced without renaming identifiers or changing literals
- **THEN** the helper rewrites the file or reports no file changes, and reports `apply: script`
