# Release readiness

Stage 4 of the delivery conductor. It sits between "the MR passed review" and
"a person merges it". It answers one question: is this change safe to merge
and roll out, and if it goes wrong, how do we get back?

It ends with a GO or NO-GO brief. It never merges, approves, or deploys.

This stage does not review code quality. Stage 3 did that. It looks only at
what merging and rolling out the change will do.

## Inputs

- MR iid (required).
- work-item key: from the ledger, else from the MR's source branch or title. If
  neither has one, continue without it and say so in the brief.

## Preconditions

Check these in order. The first one that fails is a terminal stop.

1. **Ledger.** Find it by key or iid (`delivery-ledger.md`). If none exists,
   create one for the key and record that readiness started without one.
2. **Change is open.** Write `{ "ref": "<ref>" }` (CLI alias: the MR iid) and
   read it with the exact forge command:
   `bun "${FACTORY_ROOT}/scripts/forge-provider.ts" read "<repoRoot>" "${FACTORY_ROOT}/runtime-manifest.json" <read-input.json>`.
   Use only the normalized `state`, `draft`, `branches`, `revisions`,
   `pipeline`, and `mergeability` fields.
   - `merged` → stop: "already merged; run `/delivery verify <iid>` after
     deploy".
   - `closed` → stop: "MR is closed".
   - `draft: true` → stop: "MR is still draft; run `/delivery review <iid>`".
3. **Dual Stage 3 review is current.** Run
   `scripts/stage3-readiness.ts <iid> <head> <max-pass|-> <approach-pass|->`
   against the pinned max-pass and approach-pass artifacts for this iid and
   the live head. Stay-draft (missing, stale, malformed, or blocking
   artifacts) is a terminal stop: "dual review is missing or stale; run
   `/delivery review <iid>`". A conductor-written review row alone is not
   enough and cannot stand in for those artifacts. Operator approval can
   accept a named release risk, but can never synthesize a code-review
   verdict. Recompute the patch-id (`delivery-ledger.md`, Verdict freshness)
   after the helper returns ready.
   - Helper stay-draft → stop: "dual review is missing or stale; run
     `/delivery review <iid>`".
   - Patch-id differs → stop: "the change moved since review at <short head>;
     run `/delivery review <iid>` again".
4. **Pipeline is finished at the current head.** The normalized pipeline must
   be available and `current: true`; the adapter owns provider-specific
   branch, detached, and merged-results revision checks. A pipeline with
   `current: false` belongs to older or unrelated evidence and does not count.
   Its status must be `success`.
   - Running or pending → follow `pipeline-monitoring.md`. Subscribe to a host
     CI event when available, record the wait, and end the turn without
     polling.
   - Failed → continue. It becomes a blocker in step 6.
5. **No conflicts.** Normalized mergeability must be available and
   `conflicts: false`. Unavailable mergeability is a terminal capability gap;
   conflicts become a blocker in step 6.
6. **Comments on the change are answered.** Once the MR is open, others
   (people or automated reviewers) may comment on it. Write
   `{ "ref": "<ref>", "headRevision": "<full-head-sha>" }` to
   `<discussions-input.json>`, then read the comments with the same scoping
   `/address-comments` uses:
   ```
   bun "${FACTORY_ROOT}/scripts/forge-provider.ts" discussions "<repoRoot>" "${FACTORY_ROOT}/runtime-manifest.json" <discussions-input.json> \
     | bun "${FACTORY_ROOT}/scripts/forge-comments.ts"
   ```
   Non-zero exit is a terminal stop. Every returned comment that this run did
   not publish itself is unanswered and becomes a comment blocker in step 6.

## Steps

### 1. Gather (read-only)

Collect the inputs the lenses need. Link them in the ledger; do not copy them.

- The MR description and diff (`git diff <base> <head>` using the ledger's
  recorded base).
- The OpenSpec change on the source branch: `proposal.md`, `design.md`, `tasks.md`.
- The work item.
- Stage 3's findings: what was fixed, what was dismissed, and why.
- ADRs the change adds, supersedes, or contradicts.
- How the target repo deploys: its CI deploy jobs, deploy manifests, and
  runbooks. Read them; do not guess a rollout from general practice.

### 2. Classify the change

Scan the pinned diff first:
`bun "${FACTORY_ROOT}/scripts/diff-scan.ts" <base-sha> <head-sha>`.
A non-zero exit stops the stage; never classify by hand instead. Save the
output beside the ledger and link it.

The scan's `surfaces`, `oneWay` signals, and `loweredBar` hits are a floor.
Keep every one of them. You may add a surface, signal, or hit you can prove
from the diff, with the evidence, but never remove a scanned one. Read only
the parts of the diff you need to confirm or extend the marks, not the whole
diff again.

Mark every surface the diff touches. Each mark turns on a lens in step 3.

| Surface | Signals |
|---------|---------|
| Data | Migrations, schema files, backfills, data deletes |
| Contract | Public API routes, message schemas, events, SDKs, CLI flags others call |
| Config | Env vars, secrets references, config files, feature flags |
| Auth | Authentication, authorization, permissions, tokens |
| Infra | Dockerfiles, deploy manifests, CI deploy jobs, resource limits |
| Dependencies | Lockfile or manifest changes |
| User-facing | UI, copy, docs users read |

Then make the **door call**:

- **One-way door**: cannot be undone by reverting the MR. Examples: destructive
  migrations, data deletes, emitted events or messages others consume, external
  contract removals, sent notifications.
- **Two-way door**: reverting the MR and redeploying restores the old behaviour.

Any scanned `oneWay` signal makes the change a one-way door.

Measure reviewable counts with
`bun "${FACTORY_ROOT}/scripts/review-fanout.ts" measure <base-sha> <head-sha>`.
It leaves out OpenSpec and delivery artefacts. Write those counts, the door
call, whether every classification field was proved, and the scanned surfaces
to a file beside the ledger, then:
```
bun "${FACTORY_ROOT}/scripts/review-fanout.ts" readiness \
  "<ledger-dir>/readiness-fanout-input.json"
```
The returned `mode` is authoritative. Invalid input or a non-zero exit stops
the stage; never guess a reduced fan-out.

- **`empty`:** the measured diff has no reviewable code. Do not dispatch lens
  subagents and do not run the rollback lens yourself. Persist that skip:
  ```
  bun "${FACTORY_ROOT}/scripts/record-skip.ts" persist "<repo>/.delivery/routing" "<changeName>" "<ledger-dir>/skipped-workers.json"
  bun "${FACTORY_ROOT}/scripts/routing-scorecard.ts" "<repo>/.delivery/routing" "<changeName>"
  ```
  The scorecard counts avoided workers. It never estimates tokens saved. Continue at step 4
  with no lens findings.
- **`small`:** at most 2 files, fewer than 50 changed lines, two-way, and none
  of Data, Contract, Config, Auth, or Infra. Skip the subagents in step 3 and
  run the rollback lens yourself. Persist that skip with `record-skip.ts`, then
  refresh `routing-scorecard.ts`. The scorecard counts avoided workers. It
  never estimates tokens saved.
- **`full`:** resolve `standard` and run the lenses the classification turned
  on.

### 3. Run the lenses

When mode is `empty`, skip this step. When mode is `small`, run only the
rollback brief yourself and continue at step 4. When mode is `full`,
resolve the `standard` capability against the recorded inventory:
```
bun "${FACTORY_ROOT}/scripts/model-catalogue.ts" resolve standard \
  .delivery/routing/model-inventory.json
```
Pass that exact model identifier to every lens subagent. These lenses collect
findings; the main conversation still decides GO or NO-GO, drops Stage 3
duplicates, and keeps unverified Critical and High findings blocking. A
missing live standard candidate stops the stage. Do not dispatch a fast
model for these lenses: they have no executable test, lint, or typecheck
gate of their own.

Run the lenses the classification turned on as parallel read-only subagents. Give
each one the diff, the OpenSpec change, and its brief below, not the author's
reasoning. Each returns findings as: severity (Critical, High, Important,
Suggestion), location, what happens, evidence.

- **Rollback** (always on). What does reverting the MR leave behind? Migrations
  without a tested down path, data already written in the new shape, messages
  already emitted, caches warmed in the new format, external consumers that
  already adapted. Produce the rollback procedure as exact steps and an
  estimated recovery time.
- **Compatibility** (Data or Contract). During a rollout, old and new versions
  run at the same time. Does the new schema work with the old code, and the old
  schema with the new code? Is a destructive step bundled with the expand step?
  It must be its own later change. Are the consumers of a changed contract
  listed, and are they ready?
- **Security** (Auth, Config, Dependencies, or a trust boundary named in
  `design.md`). Walk each trust boundary the change crosses: spoofing,
  tampering, repudiation, information disclosure, denial of service, elevation
  of privilege. Check the diff for secrets. Check new dependencies for known
  vulnerabilities with the repo's scanner if it has one. An incompletely
  reproduced Critical or High finding keeps its severity and is marked unverified.
- **Operability** (always on unless mode is `empty` or `small`). Take the
  on-call questions from `design.md`. If there are none, write two: "how would
  we know this is broken?" and "how would we know it is slower?". For each, name
  the log, metric, dashboard, or alert that answers it, and whether it exists
  today or arrives with this change. A question with no answer is Important.

Drop any finding that repeats a Stage 3 finding, whether fixed or dismissed.

### 4. Check the bar

Start from the scan's `loweredBar` hits from step 2. Each one stays a hit.
Then check the diff alone for any the scan cannot see:

- Tests deleted, skipped, or marked as expected failures.
- Assertions removed or loosened.
- Coverage, performance, or quality thresholds lowered.
- New suppressions: lint disables, type-check ignores, coverage ignores, secret
  scanner allows.
- Stubs or placeholder implementations in production code.

Each hit is Important unless the MR description or `design.md` explains it. A
hit that hides a failing check is Critical.

### 5. Plan the rollout

Write the plan from how the target repo actually deploys (step 1).

- **Order.** Which deploys, migrations, and config changes happen, in what
  order. For Data or Contract changes, expand ships and is verified before any
  contract step.
- **Flags.** Each flag the change adds or reads: its default, who owns it, and
  when it should be removed.
- **Stages.** How exposure widens, and the signal that must hold before each
  step. Mark any number you did not take from the repo as "default, confirm",
  such as a canary percentage or watch window.
- **Watch list.** From the operability lens: what to look at, where, for how
  long after deploy, and what counts as bad.
- **Rollback.** From the rollback lens. The trigger (which watch-list signal, at
  what level), the exact steps, and the expected recovery time.
- **Steps only a person can do.** Secrets to set, manual config, people to tell.

### 6. Decide

**NO-GO** if any of these is true:

- Unaccepted Critical and High findings, unverified ones included.
- The pipeline failed at the current head.
- The MR has conflicts.
- A comment on the change is unanswered (precondition 6). This is a comment
  blocker: it is fixed in one `/address-comments` round, never accepted as a
  risk.
- A one-way door with no rollback procedure, unless the operator has accepted
  that specific risk.

Otherwise **GO**. A GO always carries a rollback plan. A one-way door's rollback
plan says what cannot be undone and how the damage is limited instead.

For a failed pipeline, follow `pipeline-monitoring.md` before issuing the final
NO-GO. An attributable, in-scope failure below the bounded repair budget fixes
forward on the existing branch and invalidates the prior green, review, and
readiness evidence. Transient, unrelated, unknown, out-of-scope, or exhausted
failures escalate with evidence. Never blindly retry provider CI.

Only the operator can move a Critical or High finding to accepted. Record it in
the ledger's Approvals, scoped to this iid at this head, with their words.

### 7. Write the brief

The brief is for a person deciding whether to merge. Follow the human-facing
output rules: plain language, no internal jargon, no raw field names, and no
AI or tool attribution.

```markdown
## Release readiness: !<iid> <title>

**<GO | NO-GO>**. Checked at commit <short head>. Pushing again voids this
verdict unless the change itself stays the same.

### Must fix before merging
- <finding: what happens, where, evidence> <unverified>

### Comments to answer
- <comment: who asked for what, where>

### Should fix
- <finding>

### Risks accepted
- <risk> — accepted by <who> on <date> at head <short head>

### Merge danger
<One-way | Two-way> door: <why>. Blast radius: <what else this can affect>.

### Rollout
1. <step> — continue when <signal holds>

### Watch after deploy
| What | Where | For how long | Bad looks like |

### Rollback
- Trigger: <signal and level>
- Steps: <exact steps>
- Expected recovery time: <estimate>

### Steps only a person can do
- <step>
```

Leave out any section that has nothing in it.

## Checkpoint

The brief is the checkpoint. What the operator says next decides what happens:

When a NO-GO or accepted risk leaves two or more viable responses, first follow
`SKILL.md`'s **Human decision brief** to compare fixing, accepting the scoped
risk, changing rollout, or abandoning the release. A Critical or High finding
still blocks unless the operator explicitly accepts that exact risk; the brief
cannot override the gate.

| Operator | Next |
|----------|------|
| Merges | Nothing here. Recommend `/delivery verify <iid>` after deploy |
| Accepts a risk | Record the approval, recompute the verdict, reissue the brief |
| Wants a fix | Recommend `/address-comments <KEY>` or a new factory round, then `/delivery ship <iid>` again |
| Queues the change | Read the comments on the change again first (precondition 6). A new unanswered one turns GO into NO-GO |
| Asks to post the brief on the MR | Post it as one MR comment |

## Ledger writes

- Verdicts: one `readiness` row with head, base, patch-id, GO or NO-GO, and who
  produced it.
- Keys: status `[go !N]` or `[no-go !N]`.
- Decisions: the door call, the reason for the verdict, and the number of
  unanswered comments at the checked head.
- Approvals: every accepted risk.
- Stops: any terminal stop from the preconditions.

## Terminal stops

| Stop | Message | Next command |
|------|---------|--------------|
| MR merged | Already merged | `/delivery verify <iid>` |
| MR closed | MR is closed | None |
| MR draft | MR is still draft | `/delivery review <iid>` |
| No review | Dual Stage 3 review is missing or stale | `/delivery review <iid>` |
| Stale review | The change moved since it was reviewed | `/delivery review <iid>` |
| Pipeline running | Pipeline still running at <sha> | Event subscription, or `/delivery ship <iid>` later |
| Empty diff | The MR changes nothing | None |
| Two ledgers | More than one ledger names this key | Operator picks one |

## Never

- Merge, approve, or set the MR to merge when the pipeline succeeds.
- Deploy, change a flag, or run a migration.
- Transition the tracker or create work items.
- Re-review code quality. That is Stage 3's job.
- Present a default number as if it came from the repo.
