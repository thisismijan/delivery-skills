## Why

Python and TypeScript format-only units can apply without a model. Java
format-only units still pay the standard worker even when spacing can
change without renaming names or literals.

## What Changes

- Re-space listed Java files when identifier, number, string, operator,
  and comment tokens stay identical.
- Leave files unchanged when the rewrite would change that token stream.
- Do not dispatch or promote a fast catalogue model.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `mechanical-edit-classification`: a proven Java format-only rewrite is
  applied by script.

## Impact

- `factory/scripts/apply-java-mechanical-edit.ts` and
  `apply-mechanical-edit.ts`.
