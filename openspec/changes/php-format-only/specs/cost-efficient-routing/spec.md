## ADDED Requirements

### Requirement: Proven PHP format-only applies without a model
The helper SHALL recognize PHP files only for format-only. It SHALL require an
executable repository wrapper at `bin/php-format`, invoke it with the relative
file path and source on stdin, and accept stdout only when the conservative
non-whitespace token stream is identical. Heredoc, nowdoc, rename, and
import-only SHALL remain on `select-model`. Any refusal SHALL leave files
unchanged.

#### Scenario: PHP formatter changes only layout
- **WHEN** `bin/php-format` returns output with the same token stream
- **THEN** the output is written and `apply` is `script`

#### Scenario: PHP formatter is not proven
- **WHEN** the wrapper is absent or fails, changes a token, or the source contains heredoc or nowdoc
- **THEN** files remain unchanged and `apply` is `select-model`

#### Scenario: PHP rename or import-only
- **WHEN** a PHP unit requests rename or import-only
- **THEN** files remain unchanged and `apply` is `select-model`
