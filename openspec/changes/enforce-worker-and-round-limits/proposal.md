## Why

In run MDF-3212 the limits existed only in brief text and were broken anyway:

- a fifth worker started over a cap of four;
- MDF-3257 had a fourth review pass;
- two heads with commits pushed after the last review reached merge with no
  visible sign (!1001, !1013).

`config.ts ready-wave` sliced the keys it was given and could not see workers
already running. `review-rounds.ts` had no cap.

## What Changes

- **Worker cap.** `dispatch.json` entries get an optional `finishedAt`, set
  when the coordinator reconciles or stops a worker. `config.ts ready-wave`
  takes the run's `dispatch.json`, counts the workers still running against
  `maxParallelWorktrees`, dispatches only the room left, and refuses a key
  that already has a worker running. `worker-watch.ts` no longer watches
  finished workers.
- **Review-round cap.** `review-rounds.ts record` refuses a round past the
  level's `maxReviewRounds` with exit 1, and writes nothing, unless `allow`
  recorded the operator's approval for that exact next round. Older rounds
  files without allowances still load.
- **Push after GO.** Tests pin two existing refusals. The land gate refuses
  a readiness GO given at an earlier commit, and release readiness finds no
  current review for a new commit. Under auto, a push after GO is therefore
  re-reviewed before landing. A merge done by hand outside delivery is out of
  reach of any script here.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `worker-worktrees`: the parallel cap counts running workers.
- `address-comments`: a round past the cap needs a recorded approval.

## Impact

- `factory/scripts/config.ts`, `worker-watch.ts`, `review-rounds.ts`, and a
  new `limits.test.ts`
- `skills/delivery/workflows/auto.md`, `skills/address-comments/SKILL.md`,
  `docs/reference.md`
