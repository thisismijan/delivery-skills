## ADDED Requirements

### Requirement: Proven Swift format-only applies without a model
The helper SHALL recognize Swift files only for format-only. It SHALL require an
executable repository wrapper at `bin/swift-format`, invoke
`format --assume-filename <relative-file>` with source on stdin, and accept
stdout only when the conservative non-whitespace token stream is identical.
Rename and import-only SHALL remain on `select-model`. Any refusal SHALL leave
files unchanged.

#### Scenario: Swift formatter changes only layout
- **WHEN** `bin/swift-format` returns output with the same token stream
- **THEN** the output is written and `apply` is `script`

#### Scenario: Swift formatter is not proven
- **WHEN** the wrapper is absent or fails, or it changes a token or string content
- **THEN** files remain unchanged and `apply` is `select-model`

#### Scenario: Swift rename or import-only
- **WHEN** a Swift unit requests rename or import-only
- **THEN** files remain unchanged and `apply` is `select-model`
