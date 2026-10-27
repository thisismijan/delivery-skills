## Why

Mechanical-edit scoring treated Haiku as the candidate. Haiku is only one
fast-tier catalogue model. Scores must name any exact fast candidate.

## What Changes

- Require an exact fast-tier catalogue id on ingest.
- Refuse a model that is not in the fast catalogue tier.
- Stop defaulting the pack and CLI to Haiku.
- Leave live catalogue availability unchanged.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `fast-model-graduation`: model-run ingest scores an exact fast catalogue
  candidate, not a Haiku-only path.

## Impact

- `factory/scripts/mechanical-edit-model-runs.ts`
- `factory/scripts/mechanical-edit-scoring.ts`
- README and factory runtime notes
