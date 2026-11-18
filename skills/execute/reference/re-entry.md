# Re-entry reconciliation

This applies to step 3a, when execute resumes or finds state from a prior interrupted run.

Before writing or changing anything, reconcile the durable state from a prior
interrupted run: the **existing MR**, existing **test files**, persisted
**gate artifacts**, branch **commits**, and the **dirty worktree**. Bind
reusable gate evidence to the exact test/source commit and command it proved;
stale or ambiguous evidence is not reusable.

Before reusing a persisted red or green gate artifact, verify it is still
bound to the current commit, command, and test file contents. The script
calls verifyGateEvidence:
```
bun "${FACTORY_ROOT}/scripts/test-gate.ts" verify "<reviewDir>/red-gate-<test-commit>.json" "<reviewDir>/red-command.json"
bun "${FACTORY_ROOT}/scripts/test-gate.ts" verify "<reviewDir>/green-gate-<source-commit>.json" "<reviewDir>/green-command.json"
```
Non-zero exit means the evidence is stale or the command or tests changed.
Re-run the gate. Do not reuse it.

- Find any open change for this source branch with the exact forge command.
  Write `{ "sourceBranch": "<changeName>" }` to `<reviewDir>/find-input.json`,
  then:
  ```
  bun "${FACTORY_ROOT}/scripts/forge-provider.ts" find "<repoRoot>" "${FACTORY_ROOT}/runtime-manifest.json" "<reviewDir>/find-input.json"
  ```
  Non-zero exit → **stop + escalate** (fail closed). If an open change already
  points at the current branch head, report that change ref and stop
  successfully. **Never open a duplicate MR.**
- Resume from the earliest incomplete gate. Never repeat a completed write,
  **never rewrite already-proven tests**, and never discard dirty work without
  identifying whether it belongs to this run.
- If state conflicts (for example, an MR exists for an unapproved head, a red
  artifact belongs to different tests, or commits cannot be attributed), stop
  and escalate rather than guessing. Never discard unattributable dirty work,
  a stale branch, or stale gate evidence.
- `/delivery execute <KEY>` after an interrupted single-step stop is the safe
  resume, and typing execute is its approval to build. A run whose shared
  ledger records `continuous-delivery: yes` resumes from `/delivery auto
  <KEY>` without another checkbox. Do not start execute from an unapproved
  bare-key resume.
