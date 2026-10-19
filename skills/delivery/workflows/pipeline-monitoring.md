# Pipeline monitoring

This workflow watches two separate integration points:

1. the open change pipeline at its exact head revision; and
2. after a human merge, the default-branch pipeline at the exact merged
   revision.

It waits through host event subscriptions when they exist. It never busy-polls,
merges, retries provider jobs blindly, rewrites history, or treats a branch's
latest pipeline as evidence for another revision.

## Observe

### Open change

Write `{ "ref": "<ref>" }` and run `forge-provider.ts read`. Require normalized
pipeline evidence with `current: true`. Bind the observation to
`revisions.head`.

### Default branch after merge

Read the merged change again. Require `state: "merged"` and
`revisions.merged`. Write `{ "revision": "<merged revision>" }` and run:

```text
bun "${FACTORY_ROOT}/scripts/forge-provider.ts" pipeline "<repoRoot>" \
  "${FACTORY_ROOT}/runtime-manifest.json" <pipeline-input.json>
```

The result must name the requested revision, and any available nested pipeline
must name that same revision. Missing, stale, or malformed evidence never
counts as success.

## Wait without polling

If the pipeline is absent, queued, pending, preparing, or running:

1. Record `[waiting: <what>]` with `pipeline <revision>` as the value, plus the
   forge URL when available.
2. If the host exposes a CI event subscription for this forge and branch, reuse
   an existing matching subscription or create one. For an open change,
   subscribe to both CI completion and change merge/close activity. For the
   default branch, subscribe to CI for the merged revision or default branch.
3. End the turn. On wake, re-read normalized forge evidence; event payloads are
   hints, not authority.
4. If no subscription exists, end the turn with `/delivery auto <KEY>` as the
   resume command. A later invocation observes once again.

Never sleep, loop, or repeatedly call status APIs in one turn.

## Route a terminal result

Run `pipeline-route.ts` with the phase, exact-revision evidence, attribution,
attempt, `maxFixAttempts`, and whether the repair is inside the frozen run
contract.

### Success

- Open change: continue release readiness.
- Default branch: record the successful merged revision, archive when needed,
  then wait for deployment and run post-merge verification.

### Failure diagnosis

Read the failed job names and sanitized logs when the host exposes them. Re-run
the smallest relevant command locally when possible. Classify only from
evidence:

- **Attributable:** the changed code, tests, configuration, or migration caused
  the failure.
- **Transient:** infrastructure, runner, network, quota, or a demonstrated
  flaky check failed independently of the patch.
- **Unrelated:** another revision or component caused it.
- **Unknown:** evidence cannot distinguish the cause.

Do not infer attribution from timing alone.

### Fix forward

Only an attributable failure, inside the frozen run contract, and below
`maxFixAttempts` may fix forward.

- **Open change:** repair the existing branch. Re-run every invalidated green,
  review, and readiness gate, push the new head, then monitor that exact head.
- **Default branch:** never revert or push directly to the protected branch.
  Create one recovery branch and a new draft change tied to the failed merged
  revision. Keep the original acceptance criteria and permitted writes. Run
  draft, execute, dual review, and release readiness normally. A human still
  merges it.

A repair that adds scope, goals, acceptance criteria, work items, or permitted
writes needs a superseding run contract and explicit plan approval.

### Escalate

Escalate with the exact revision, failed checks, sanitized evidence, local
reproduction result, attribution, and recommended owner when:

- the failure is transient, unrelated, or unknown;
- retrying provider CI is required (there is no portable retry operation);
- the repair exceeds approved scope;
- the fix-forward budget is exhausted; or
- evidence is missing or contradictory.

The escalation may recommend a provider retry, rollback, containment, or a new
plan. It never performs a human-owned action.

## Ledger writes

- Decision: phase, revision, pipeline status, URL, and attribution evidence.
- Waiting: exact revision and active subscription when present.
- Fix-forward: attempt number, failed revision, recovery branch, and new change
  reference.
- Stop: escalation reason and next human action.

## Terminal stops

| Stop | Message | Next |
|------|---------|------|
| Revision absent | The exact head or merged revision is unavailable | Repair provider evidence or escalate |
| Attribution unknown | The pipeline failure cannot be attributed safely | Human inspects the named checks and logs |
| Scope expansion | The repair exceeds the frozen run contract | Approve a superseding plan or abandon it |
| Budget exhausted | The bounded fix-forward budget is exhausted | Human chooses containment, rollback, or a new plan |
| CI retry required | Retrying provider CI is not a portable operation | Human retries in the forge, then resumes delivery |

## Never

- Merge, close, approve, revert, force-push, or push to the default branch.
- Retry a failed provider job without an explicit portable capability.
- Reuse green or review evidence invalidated by a repair.
- Treat a successful open-change pipeline as proof that the merged revision
  passed on the default branch.
