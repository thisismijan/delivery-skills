## Why

Swift is TIOBE #19 and Apple's `swift-format` is a widely used canonical
formatter. Rename and import proof require SourceKit-level semantics, so the
safe bounded gain is format-only.

## What Changes

- Recognize `.swift` as a mechanical-edit language.
- Format-only requires executable repository wrapper `bin/swift-format`,
  invoked as `bin/swift-format format --assume-filename <relative-file>` with
  source on stdin. This matches Apple's swift-format CLI.
- Output is accepted only when a conservative Swift token stream is identical.
  Nested block comments, line comments, ordinary, multiline, and raw strings,
  backtick identifiers, identifiers, and symbols are handled. Any change inside
  a string, including interpolation spacing, is refused.
- Rename and import-only remain on the model worker.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `cost-efficient-routing`: proven Swift format-only units skip model workers.

## Impact

- New `factory/scripts/apply-swift-format.ts` and tests
- `factory/scripts/apply-mechanical-edit.ts`
- Mechanical-edit documentation and contract tests
