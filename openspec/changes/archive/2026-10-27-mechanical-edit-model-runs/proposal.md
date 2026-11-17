## Why

The test-repo loop can materialize fixtures, but its local rewrite is
`test-repo-stand-in` and cannot graduate a fast model. Real scores need
captured baseline and candidate trees from an advertised model run.

## What Changes

- Prepare a capture directory for each unscripted mechanical-edit fixture.
- Ingest only complete paired artifacts with token usage, named workers,
  and hidden checks.
- Record those scores as `model-run` provenance.
- Refuse stand-in rewrites, character-only usage, and missing workers.
- Leave live catalogue availability unchanged for every fast candidate.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `fast-model-graduation`: captured model-run trees can be scored; stand-in
  and incomplete captures cannot.

## Impact

- `factory/scripts/mechanical-edit-model-runs.ts`
- README and factory runtime notes
