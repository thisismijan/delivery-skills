## ADDED Requirements

### Requirement: Proven Go mechanical edits apply without a model
The mechanical-edit helper SHALL apply a Go rename only for one unexported
declaration whose package occurrences are all listed. Import-only SHALL remove
unused ordinary imports and add a local package import only when its package
name resolves to one repository directory. Format-only SHALL use the Go
standard formatter. Every refusal SHALL leave all files unchanged and keep
`apply` on `select-model`.

#### Scenario: Complete unexported rename
- **WHEN** one unexported Go identifier is declared once and every package occurrence is in the listed files
- **THEN** every identifier token is renamed, strings and comments are unchanged, and `apply` is `script`

#### Scenario: Rename could affect code outside the proven graph
- **WHEN** the Go name is exported, shadowed, already has the target name, or occurs in an unlisted package file
- **THEN** `apply` is `select-model` and every file is unchanged

#### Scenario: Unique local package import
- **WHEN** an unbound selector name matches exactly one local package directory in the module
- **THEN** import-only adds that module import and `apply` is `script`

#### Scenario: Ambiguous local package import
- **WHEN** an unbound selector name matches more than one local package directory
- **THEN** no import is added

#### Scenario: Go format-only
- **WHEN** listed Go files parse and format-only is requested
- **THEN** the standard formatter writes canonical Go source and `apply` is `script`
