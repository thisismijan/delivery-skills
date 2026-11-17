## Why

Rust is TIOBE #10 and has a canonical formatter, but rename and missing-import
proof would require rust-analyzer or compiler semantics. Format-only gives the
safe, bounded gain without pretending a lexer can resolve Rust symbols.

## What Changes

- Recognize `.rs` as a mechanical-edit language.
- Format-only requires executable repository wrapper `bin/rustfmt`. It receives
  source on stdin with `--emit stdout --edition 2021`.
- Output is accepted only when a conservative Rust token stream is identical.
  The tokenizer handles nested block comments, line comments, strings, raw
  strings, byte strings, character literals, identifiers, and symbols.
- Rename and import-only remain on the model worker.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `cost-efficient-routing`: proven Rust format-only units skip model workers.

## Impact

- New `factory/scripts/apply-rust-format.ts` and tests
- `factory/scripts/apply-mechanical-edit.ts`
- Mechanical-edit documentation and contract tests
