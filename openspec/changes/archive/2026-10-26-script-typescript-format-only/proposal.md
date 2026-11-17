## Why

TypeScript rename and import-only units can apply without a model.
Format-only units still pay the standard worker even when formatting would
not change identifiers or literals.

## What Changes

- Apply TypeScript document formatting on listed files when the syntax tree
  of identifiers and literals stays identical.
- Leave files unchanged when formatting would change structure.
- Python and Java format-only units stay on today's worker.
- Do not dispatch or promote a fast catalogue model.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `mechanical-edit-classification`: a proven TypeScript format-only rewrite
  is applied by script.

## Impact

- `factory/scripts/apply-mechanical-edit.ts`.
