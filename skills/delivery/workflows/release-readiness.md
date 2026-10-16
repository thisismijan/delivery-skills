# Release readiness

Stage 4 of the delivery conductor. It sits between "the MR passed review" and
"a person merges it". It answers one question: is this change safe to merge
and roll out, and if it goes wrong, how do we get back?

It ends with a GO or NO-GO brief. It never merges, approves, or deploys.

This stage does not review code quality. Stage 3 did that. It looks only at
what merging and rolling out the change will do.

## Inputs

- MR iid (required).
- Jira key: from the ledger, else from the MR's source branch or title. If
  neither has one, continue without it and say so in the brief.

## Preconditions

Check these in order. The first one that fails is a terminal stop.

1. **Ledger.** Find it by key or iid (`delivery-ledger.md`). If none exists,
   create one for the key and record that readiness started without one.
2. **MR is open.** Read it: `glab mr view <iid> --output json`. Use `state`,
   `draft`, `sha`, `source_branch`, `target_branch`, `has_conflicts`,
   `detailed_merge_status`, and `head_pipeline`.
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
4. **Pipeline is finished at the current head.** `head_pipeline` belongs to the
   current head `sha` when either:
   - `head_pipeline.sha` equals `sha` (a branch or detached pipeline), or
   - `head_pipeline.sha` is a merged-results commit whose second parent is `sha`.
     Projects with merged-results pipelines run the MR's pipeline on
     `refs/merge-requests/<iid>/merge`, a commit merging the head into the
     target, so its sha is never the head itself. Read the parents with
     `glab api projects/<project>/repository/commits/<head_pipeline.sha>`.

   A pipeline that belongs to an older head does not count. Its status must be
   `success`.
   - Running or pending → stop: "pipeline still running at <short sha>; run
     `/delivery ship <iid>` when it finishes". Do not wait or poll.
   - Failed → continue. It becomes a blocker in step 6.
5. **No conflicts.** `has_conflicts` is false. Conflicts become a blocker in
   step 6.

## Steps

### 1. Gather (read-only)

Collect the inputs the lenses need. Link them in the ledger; do not copy them.

- The MR description and diff (`git diff <base> <head>` using the ledger's
  recorded base).
- The OpenSpec change on the source branch: `proposal.md`, `design.md`, `tasks.md`.
- The Jira ticket.
- Stage 3's findings: what was fixed, what was dismissed, and why.
- ADRs the change adds, supersedes, or contradicts.
- How the target repo deploys: its CI deploy jobs, deploy manifests, and
  runbooks. Read them; do not guess a rollout from general practice.

### 2. Classify the change

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

**Small change rule.** If the diff touches 2 files or fewer, is under 50 changed
lines, is a two-way door, and marks none of Data, Contract, Config, Auth, or
Infra, skip the subagents in step 3 and run the rollback lens yourself.

### 3. Run the lenses

Run the lenses the classification turned on as parallel read-only subagents. Give
each one the diff, the OpenSpec change, and its brief below, not the author's
reasoning. Each returns findings as: severity (Critical, Important, Suggestion),
location, what happens, evidence.

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
- **Operability** (always on unless the small change rule applied). Take the
  on-call questions from `design.md`. If there are none, write two: "how would
  we know this is broken?" and "how would we know it is slower?". For each, name
  the log, metric, dashboard, or alert that answers it, and whether it exists
  today or arrives with this change. A question with no answer is Important.

Drop any finding that repeats a Stage 3 finding, whether fixed or dismissed.

### 4. Check the bar

Scan the diff alone for the bar being lowered:

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
- A one-way door with no rollback procedure, unless the operator has accepted
  that specific risk.

Otherwise **GO**. A GO always carries a rollback plan. A one-way door's rollback
plan says what cannot be undone and how the damage is limited instead.

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

| Operator | Next |
|----------|------|
| Merges | Nothing here. Recommend `/delivery verify <iid>` after deploy |
| Accepts a risk | Record the approval, recompute the verdict, reissue the brief |
| Wants a fix | Recommend `/address-comments <KEY>` or a new factory round, then `/delivery ship <iid>` again |
| Asks to post the brief on the MR | Post it as one MR comment |

## Ledger writes

- Verdicts: one `readiness` row with head, base, patch-id, GO or NO-GO, and who
  produced it.
- Keys: status `[go !N]` or `[no-go !N]`.
- Decisions: the door call and the reason for the verdict.
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
| Pipeline running | Pipeline still running at <sha> | `/delivery ship <iid>` later |
| Empty diff | The MR changes nothing | None |
| Two ledgers | More than one ledger names this key | Operator picks one |

## Never

- Merge, approve, or set the MR to merge when the pipeline succeeds.
- Deploy, change a flag, or run a migration.
- Transition Jira or create Jira issues.
- Re-review code quality. That is Stage 3's job.
- Present a default number as if it came from the repo.
