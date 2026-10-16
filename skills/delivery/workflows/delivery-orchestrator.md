# Workflow: delivery-orchestrator

> Historical and non-actionable. Do not execute the three-stage flow below.
> This file cannot override `../SKILL.md` (the conductor), `auto.md` (the
> next-step table), or the current stage specs. Keep it as a record of the
> retired three-stage conductor only.

Thin conductor: sequence the three stage workflows with push-right briefs. No
duplicate stage logic — every build/review behavior lives in the stage specs
and the commands they name.

Terms: see [`NOTES.md`](../NOTES.md).

Stages:

1. [`epic-to-backlog`](epic-to-backlog.md)
2. [`ticket-to-mr`](ticket-to-mr.md)
3. [`mr-review-to-ready`](mr-review-to-ready.md)

## Loop

Recurring: operator wants "run delivery" from an idea/epic through to
merge-ready, without remembering the slash-command order.

## Trigger

**Event:** operator invokes the conductor in Claude Code (target-repo cwd) with
one of:

| Entry | Argument | Starts at |
|-------|----------|-----------|
| Full epic | file path, inline text, or pasted epic | Stage 1 |
| Single ticket | `JIRA-KEY` | Stage 2 |
| Review only | MR `iid` (and optional `JIRA-KEY`) | Stage 3 |

If the argument is ambiguous (looks like both a path and a key), ask once which
entry they mean; recommended: treat `^[A-Z]+-\d+$` as ticket, pure digits as MR
iid, else epic/idea input.

## Preconditions

Union of the stage preconditions for the entry point chosen. Do not start stage
2 without OpenSpec init; do not start stage 3 without `gl-mr`.

## Steps

### A. Full epic entry

1. Run [`epic-to-backlog`](epic-to-backlog.md) to completion (including Jira key
   map checkpoint and **wave view**).
2. **Ready-now set:** tickets whose blocked-by is empty (or already merged).
   If that set has more than one key — the common case when the epic is all
   parallel — emit a **fan-out brief** and stop for the operator to open one
   worktree + `/delivery <KEY>` per ticket. Do not multiplex execute here.
   If the operator asks to stay serial, honor that and run one key at a time
   through ticket-to-mr → mr-review-to-ready → human merge.
3. **True blockers only:** if some keys must land before others, run those
   blocker keys serially in this session (ticket-to-mr → review → human
   **merge**; ready MR alone does not unblock dependents). Then emit a fan-out
   brief for everything newly unblocked.
4. **Further waves:** when the operator reports merges (or skips), recompute
   the ready-now set and either fan out again or run remaining blockers.
5. Epic-level closing brief when nothing remains: keys, MR iids / merges,
   stops; human owns leftover merge/archive/Jira status.

Fan-out brief shape:

```
Ready for parallel worktrees (no unmerged blockers):
  git worktree add ../wt-<key> -b <branch-from-main>
  cd ../wt-<key> && claude … → /delivery <KEY>
Keys: KEY-1, KEY-2, KEY-3, …
```

### B. Single ticket entry

1. Run stage 2, then stage 3 if an MR iid exists.
2. Stop on any terminal factory outcome; do not invent retries inside the same
   session (human re-invokes after fixing input).

### C. Review-only entry

1. Run stage 3 only.

## Checkpoint policy

- Use each stage's checkpoints; do not add extra confirms between factory
  substeps inside a stage.
- When multiple tickets are ready-now: one fan-out brief (default). Serial
  only if the operator asks, or a ticket is a true blocker for others.
- Dependents wait on **merged** blockers, not merely ready MRs.
- Never auto-merge, never auto-archive, never create Jira issues, never
  auto-create worktrees unless a later build explicitly adds that.

## Done

Conductor done when the chosen entry's stages have stopped and the operator has
the final brief (artifacts + human exits: merge, `/openspec-archive`, Jira status).

## Out of scope

- Reimplementing groom, draft, execute, holdout, code-review, or mr-review
- Cursor runtime port
- Auto-spawning worktrees or parallel Claude sessions (brief only; operator fans out)

## Implementer notes

1. Preferred v1 shape: a Claude Code skill or slash command that only routes to
   the three workflows (or prints the exact slash commands for the operator to
   run). Smallest useful build: a skill that documents the route table and
   enforces entry detection + between-ticket briefs.
2. Do not fork ig-spec agents into the conductor.
3. Live stage behaviour is in `../SKILL.md`, `auto.md`, and the current stage
   specs. If this record disagrees with them, ignore this file.
