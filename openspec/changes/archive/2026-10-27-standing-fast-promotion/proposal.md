## Why

Promoting Spark required a one-off catalogue edit and docs that named that
id. The next fast model, and each new version id, would repeat that story.
Scoring is already keyed by exact candidate. Catalogue write and listing
should be too.

## What Changes

- Register a new exact id into the fast tier as evaluation-only.
- Promote from a scored corpus plus `--approve` of that same id, writing
  only that row live.
- Operator docs describe the commands, not a named live model.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `fast-model-graduation`: standing register and promote for any exact
  fast catalogue id.

## Impact

- `factory/scripts/fast-dispatch.ts`
- `factory/scripts/model-catalogue.ts`
- README and factory runtime notes
