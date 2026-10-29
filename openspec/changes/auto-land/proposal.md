## Why

A continuous `/delivery auto` run stops at every GO and waits for a person to
press merge, even when a person has already approved the change on the forge
and its pipeline is green. The person has made the decision; the click adds
nothing but delay, and every later stage (archive, verify, the board move to
done) waits on it.

## What Changes

- New `land` stage in the SDLC constitution. Its only write is `change-land`,
  and it runs only inside a continuous auto run.
- New forge operations: `approvals` reads who approved the change, and `land`
  squash-merges it with the exact head as a guard.
- `land` runs its own gate before it merges. Every check must hold for the same
  head commit:
  - the change is open and not a draft;
  - the forge reports it approved by at least one person and every approval
    rule is met;
  - the latest pipeline on that commit passed;
  - there are no conflicts;
  - no comment arrived that the GO did not see;
  - the ledger records `continuous-delivery: yes` and a readiness GO at that
    head, and its run contract header matches the frozen contract;
  - the frozen run contract permits `change-land` for the ticket.
- The gate answers `landed`, `wait` (pipeline running, approval not yet given,
  mergeability still being computed), or `stop` (anything else). It never
  merges on missing or contradictory evidence.
- An archive change lands through the same gate without a readiness verdict,
  but only when every file it touches is under `openspec/`.
- `land` runs only through the executable adapter. Session tools still never
  merge, and the shell guard still blocks direct merge commands.
- An ungated merge, and any merge outside auto, stays human-owned.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `forge-operations`: approval evidence and the gated `land` operation.
- `stage-gating`: the `land` stage and its run-contract check.

## Impact

- `factory/scripts/forge-provider.ts`, new `factory/scripts/land-gate.ts`
- `providers/gitlab/gitlab-forge.ts`, `providers/github/github-forge.ts`
- `skills/delivery/sdlc-constitution.json`, `SDLC-CONSTITUTION.md`,
  `factory/scripts/sdlc-constitution.ts`
- `skills/delivery/workflows/auto.md`, `skills/delivery/SKILL.md`,
  `factory/CONVENTIONS.md`, `README.md`
- Existing frozen run contracts must be approved again because the
  constitution hash changes.
