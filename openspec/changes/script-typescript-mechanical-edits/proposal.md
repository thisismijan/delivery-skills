## Why

A classified mechanical-edit still pays the standard model unless a script
can prove the patch. The classifier records that preference, but it does not
rename anything. A TypeScript identifier rename that is local to the listed
files should not start an implementer.

## What Changes

- Add a fail-closed apply helper that uses the TypeScript language service
  for identifier rename.
- Apply only when every reference lives in the listed files, the source name
  is one symbol, and the target name is not already used in those files.
- Leave files unchanged and keep `select-model` when the graph is incomplete,
  the files are not TypeScript, or the operation is import-only or
  format-only.
- Point execute and address-comments at that helper. They must not treat a
  caller-set script flag as proof.
- Do not dispatch or promote a fast catalogue model.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `mechanical-edit-classification`: a proven TypeScript identifier rename is
  applied by script; unproven units stay on today's worker.

## Impact

- `factory/scripts/apply-mechanical-edit.ts` (new).
- Execute and address-comments call the apply helper with the repo root.
- README and runtime docs name the TypeScript rename script.
- TypeScript becomes a factory runtime dependency so the installed pack can
  apply.
