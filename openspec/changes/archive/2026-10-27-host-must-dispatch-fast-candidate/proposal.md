## Why

`composer-1` is in the fast catalogue and in a recorded inventory, and
`resolve fast --evaluation` returns it. This runtime still cannot dispatch
that exact id: the host rejects it and the advertised worker list omits it.
A Java baseline ran; the candidate arm never started. There is no ingest
JSON and no promotion. Listing an id is not the same as being able to run
it.

## What Changes

- Capture instructions require the host to accept the exact candidate id
  before any candidate arm. Inventory membership and evaluation resolve
  are not enough.
- If the host refuses that id, stop. Do not ingest a partial capture. Do
  not copy another candidate's tree. Do not invent tokens or results.
- Name every unscripted fixture that still needs a candidate run.
- Leave `composer-1` evaluation-only. Do not change Spark or Haiku.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `fast-model-graduation`: a host that cannot dispatch the exact
  candidate cannot produce model-run scores for it.

## Impact

- `factory/scripts/mechanical-edit-model-runs.ts`
- README and factory runtime notes
