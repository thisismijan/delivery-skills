## ADDED Requirements

### Requirement: Proven Kotlin mechanical edits apply without a model
The helper SHALL rename one Kotlin declaration only when every identifier token
with that name is listed. It SHALL add an import only when a used type resolves
to exactly one package-qualified declaration in the repository. Format-only
SHALL require `bin/ktfmt` and accept output only when the non-whitespace token
stream is identical. It SHALL NOT rename a Kotlin file with its type. Every
refusal SHALL leave files unchanged and keep `apply` on `select-model`.

#### Scenario: Complete Kotlin rename
- **WHEN** one Kotlin identifier is declared once and every occurrence is in listed files
- **THEN** identifier tokens are renamed, strings and comments are unchanged, and `apply` is `script`

#### Scenario: Kotlin rename is not proven
- **WHEN** the name is overloaded or shadowed, the target exists, an occurrence is unlisted, or a string template contains the name
- **THEN** files remain unchanged and `apply` is `select-model`

#### Scenario: Unique Kotlin type import
- **WHEN** a used capitalized type is declared at exactly one package-qualified path
- **THEN** import-only adds that import and `apply` is `script`

#### Scenario: Ambiguous Kotlin type import
- **WHEN** two package-qualified declarations have the same used type name
- **THEN** no import is added

#### Scenario: Kotlin format-only
- **WHEN** executable `bin/ktfmt` returns output with the same token stream
- **THEN** the formatted source is written and `apply` is `script`
