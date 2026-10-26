## Why

TypeScript import-only units can apply without a model. Python import-only
units still pay the standard worker even when unused top-level names can be
dropped without touching the rest of the module.

## What Changes

- Drop unused top-level Python imported names when the remaining non-import
  AST stays identical.
- Leave files unchanged for star imports, nested imports, postponed
  annotations, or comments on import lines.
- Java import-only units stay on today's worker.
- Do not dispatch or promote a fast catalogue model.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `mechanical-edit-classification`: a proven Python import-only rewrite is
  applied by script.

## Impact

- `factory/scripts/python-mechanical-edit.py` and `apply-mechanical-edit.ts`.
