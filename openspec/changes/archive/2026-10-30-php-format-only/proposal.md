## Why

PHP is TIOBE #14. Its tooling is fragmented across PHP-CS-Fixer, PHP_CodeSniffer,
and other formatters, and dynamic symbols make rename and import proof unsafe
without a semantic engine. A repository-owned formatter contract gives a safe
format-only path.

## What Changes

- Recognize `.php` as a mechanical-edit language.
- Format-only requires executable repository wrapper `bin/php-format`, invoked
  as `bin/php-format <relative-file>` with source on stdin and formatted source
  on stdout. The repository chooses the underlying formatter.
- Output is accepted only when a conservative PHP token stream is identical.
  Comments and whitespace may change; names, variables, literals, attributes,
  and symbols may not.
- Heredoc and nowdoc sources stay on the model worker.
- Rename and import-only remain on the model worker.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `cost-efficient-routing`: proven PHP format-only units skip model workers.

## Impact

- New `factory/scripts/apply-php-format.ts` and tests
- `factory/scripts/apply-mechanical-edit.ts`
- Mechanical-edit documentation and contract tests
