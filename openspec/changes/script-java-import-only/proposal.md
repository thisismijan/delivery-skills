## Why

Python and TypeScript import-only units can apply without a model. Java
import-only units still pay the standard worker even when unused single-type
imports can be dropped without touching the rest of the compilation unit.

## What Changes

- Drop unused Java single-type imports when remaining identifier tokens
  outside import lines stay identical.
- Leave files unchanged for star imports or import forms the tokenizer
  cannot prove.
- Do not dispatch or promote a fast catalogue model.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `mechanical-edit-classification`: a proven Java import-only rewrite is
  applied by script.

## Impact

- `factory/scripts/apply-java-mechanical-edit.ts` and
  `apply-mechanical-edit.ts`.
