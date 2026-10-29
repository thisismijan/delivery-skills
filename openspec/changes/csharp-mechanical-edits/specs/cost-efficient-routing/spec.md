## ADDED Requirements

### Requirement: Proven C# mechanical edits apply without a model
The mechanical-edit helper SHALL rename one C# declaration only when every
identifier token with that name is listed. It SHALL add a `using` only when a
used type name resolves to exactly one namespace declared in the repository.
Format-only SHALL require a repository executable at `bin/csharpier` and SHALL
accept its output only when the non-whitespace token stream is identical. Every
refusal SHALL leave files unchanged and keep `apply` on `select-model`.

#### Scenario: Complete C# rename
- **WHEN** one C# identifier is declared once and every occurrence is in listed files
- **THEN** identifier tokens are renamed, strings and comments are unchanged, and `apply` is `script`

#### Scenario: C# rename is not proven
- **WHEN** the name is overloaded or shadowed, the target exists, an occurrence is unlisted, or interpolation contains the name
- **THEN** files remain unchanged and `apply` is `select-model`

#### Scenario: Unique repository type import
- **WHEN** a used capitalized type name is declared in exactly one repository namespace
- **THEN** import-only adds that `using` and `apply` is `script`

#### Scenario: Ambiguous repository type import
- **WHEN** two repository namespaces declare the same used type name
- **THEN** no `using` is added

#### Scenario: C# format-only
- **WHEN** executable `bin/csharpier` returns a rewrite with the same token stream
- **THEN** the formatted source is written and `apply` is `script`

#### Scenario: C# formatter changes a token
- **WHEN** the formatter changes a name, literal, or other non-whitespace token
- **THEN** files remain unchanged and `apply` is `select-model`
