## Why

TypeScript identifier renames can apply without a model. Import-only units
still pay the standard worker even when organize-imports would only change
import declarations.

## What Changes

- Apply TypeScript organize-imports on listed files when every text change
  sits inside import declarations.
- Leave files unchanged when the rewrite would touch non-import code.
- Python and Java import-only units stay on today's worker.
- Do not dispatch or promote a fast catalogue model.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `mechanical-edit-classification`: a proven TypeScript import-only rewrite
  is applied by script.

## Impact

- `factory/scripts/apply-mechanical-edit.ts`.
