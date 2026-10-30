## ADDED Requirements

### Requirement: Proven Rust format-only applies without a model
The helper SHALL recognize Rust files only for format-only. It SHALL require an
executable repository wrapper at `bin/rustfmt`, pass source on stdin with
`--emit stdout --edition 2021`, and accept output only when its conservative
non-whitespace token stream is identical. Rename and import-only SHALL remain
on `select-model`. Any refusal SHALL leave files unchanged.

#### Scenario: Rust formatter changes only layout
- **WHEN** `bin/rustfmt` returns output with the same token stream
- **THEN** the output is written and `apply` is `script`

#### Scenario: Rust formatter is unavailable or changes a token
- **WHEN** `bin/rustfmt` is absent, fails, or changes a non-whitespace token
- **THEN** files remain unchanged and `apply` is `select-model`

#### Scenario: Rust rename or import-only
- **WHEN** a Rust unit requests rename or import-only
- **THEN** files remain unchanged and `apply` is `select-model`
