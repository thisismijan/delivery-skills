# Reusing persisted gate evidence

Read this on re-entry, before reusing a per-comment or cumulative gate
artifact that an earlier run persisted under `<reviewDir>`.

Verify the artifact is still bound to the current commit, command, and test
file contents. The script calls verifyGateEvidence:
```
bun "${FACTORY_ROOT}/scripts/test-gate.ts" verify "<reviewDir>/red-gate-<commentId>-<test-commit>.json" "<reviewDir>/red-command-<commentId>.json"
bun "${FACTORY_ROOT}/scripts/test-gate.ts" verify "<reviewDir>/green-gate-<commentId>-<source-commit>.json" "<reviewDir>/green-command-<commentId>.json"
```
Non-zero exit means the evidence is stale or the command or tests changed, so
re-run the gate. Do not reuse it.
