# Auto

`/delivery auto` runs the whole lifecycle from wherever a run is. Approval of
the groomed ticket or slice plan is standing authorization to draft, build,
review, publish review notes, archive, verify, write the retro, and prepare
evidence-backed improvement candidates for that run. It is not authorization
to merge, accept a release risk, install an improvement candidate, or override
a failed gate.

The full-epic `/delivery <idea-or-file>` path enters this same continuous mode
as soon as the operator approves the groomed plan. The operator does not need
to invoke `auto` again. Explicit single-step verbs still run one stage only.

The single-step verbs use the same table to tell the operator what to type next.

## Inputs

| Argument | Starts with |
|----------|-------------|
| none | The run already in this conversation. If there is none, ask once for an idea, a key, or an MR iid |
| an idea, a file, or a link | A new run. Discovery if the idea names no destination (ask once), otherwise groom |
| an epic key | Every key in the epic's ledger |
| a ticket key | That key. If it has no ledger and its work-item type is Bug, intake (ask once) |
| an MR iid | Review for that MR |

## Start

1. Run the conductor's Phase 1: find or create the ledger and reconcile it.
2. **Continuous authorization.** Record `continuous-delivery: yes`, scoped to
   this run. The authorizing words are the `/delivery auto` invocation or the
   operator's explicit approval of the groomed plan in the full-epic path.
   This standing authorization covers the non-human stages named above. Do not
   ask a second build, test-seam, review-publication, archive, retro, or
   improvement-preparation question.
3. Append a Decision: `auto started at <stage> for <keys>`.

## The loop

Repeat until every key is done, stopped, or waiting on a person:

1. Reconcile the ledger with the real state.
2. Pick the key to work on (Choosing a key, below).
3. Check the capabilities that stage needs with `checkCapabilities`. Re-check
   at each stage boundary so a later capability is checked when that stage
   begins.
4. Look up its next step in the table and run it.
5. Write the ledger, then go back to 1.

Between steps, do not ask whether to continue. Continue.

### Next step by status

| Status | Next step | Asks the operator |
|--------|-----------|-------------------|
| no ledger yet | Discovery if the idea names no destination, otherwise groom | Discovery's yes, or groom's own gates |
| `[discovering]` | Resume discovery | The one-pager yes |
| `[discovered]` | Groom from the approved one-pager and its source artifacts | Groom's own gates |
| `[triage: needs-info]` | Nothing until the reporter answers | Nothing; it is waiting on the reporter |
| `[triage: ready]` | Draft | Nothing |
| `[triage: wont-fix]` | Nothing | Nothing; the key is done |
| `[triage: duplicate <KEY>]` | Nothing | Nothing; the key is done |
| `[groomed]` | Draft, once every blocker is `[merged !N]` or later | Nothing |
| `[drafted]` | Execute | Nothing |
| `[executing]` | Recover: review once a matching merge request exists; wait while a live owner still builds; interrupted stop with `/delivery execute <KEY>` when there is no owner and no merge request | Nothing |
| `[reviewed-blocked !N]` | Address comments, then review the new head | Nothing |
| `[addressed !N]` | Review the new head | Nothing |
| `[ready !N]` | Release readiness | Nothing |
| `[no-go !N]` | Classify the readiness blockers: address code/comment blockers then run ship again; wait on pipeline/conflicts; ask only for operator-owned risk acceptance | Whether to accept an operator-owned risk |
| `[go !N]` | The operator merges | The merge |
| `[merged !N]` | Archive the change, wait for the deploy, then verify | Nothing |
| `[verified !N]` | The key is done. Choose the next key; when none is left, retro | Nothing |
| `[regressed !N]` | Nothing. Show the rollback recommendation or the bug report | Nothing; the operator decides |
| `[retro done]` | Prepare an improvement candidate for any accepted lesson targeting delivery; otherwise the run is done | Installing the exact candidate |
| `[stopped: <reason>]` | Nothing. Never retry | Nothing; show the next command from Stops |
| `[waiting: <what>]` | Check whether it has arrived, then carry on or keep waiting | Nothing new |

**Review rounds.** Review, then address-comments, then review again counts as one
round. After three rounds without `[ready !N]`, stop and ask the operator how to
proceed.

**Archive.** Resolve the change with `factory/scripts/find-change.ts`; exactly
one match is required, so `MDF-1234` can never select `MDF-12345`. If it is
already under `openspec/changes/archive/`, skip the archive. Otherwise run
`/openspec-archive <change-name>` under the run's continuous authorization.
Commit and push the archive through the repository's normal protected-branch
path; open a follow-up change request when direct push is unavailable. Never
merge it. Archive publication may wait for that human merge, but it does not
block deployed verification, retro, or improvement preparation for the
already-merged product change.

### Choosing a key

- One key in scope: that key.
- An epic: the keys whose blockers are all merged and that are not done, stopped,
  or handed off.
- More than one key can start now: automatically fan out the entire ready wave.
  Serial execution is allowed only for a real blocking edge recorded in the
  approved plan.
  1. Resolve one absolute shared `DELIVERY_STATE_ROOT` from the primary
     worktree. The coordinator remains the only writer of the run ledger.
     Reserve the whole wave in one compare-and-swap write before dispatch.
  2. Create one detached git worktree per key from the recorded base. Keep
     worktrees outside one another. Never reuse a dirty or occupied path.
     Use argv-equivalent execution, not a shell-built string:
     `git worktree add --detach <path> <full-base-sha>`. The worker creates the
     deterministic ticket branch before its first commit.
  3. Dispatch one mutating isolated worker per worktree through the runtime's
     `agent.dispatch` capability. Its command is `/delivery auto <KEY>`, its cwd
     is that worktree, and its environment includes the shared state root plus
     `DELIVERY_WORKER_JOURNAL=<state-root>/workers/<run-id>/<key>.md`. Give it
     the reserved ledger generation and immutable key row. A worker writes only
     its own journal through `ledger-store.ts`; it never mutates the run ledger.
  4. Give each worker the fan-out brief and forbid merge, tracker transitions,
     sibling worktrees, and work outside its key.
  5. Start all workers before awaiting any one of them. Reconcile each result
     from its journal, git, and forge, not from prose. After the wave settles,
     apply validated key updates to the run ledger in one coordinator
     compare-and-swap write. A malformed, missing, or conflicting result stops
     that key without cancelling successful siblings.
  6. Append `dispatched <KEY> to <worktree>` for each key. Remove a worktree only
     after its branch and artifacts are durably pushed and the worker has
     stopped.
- If the runtime cannot dispatch isolated mutating workers, stop once with the
  missing capability and the fan-out commands. Do not silently run an
  independent ready wave sequentially.
- Two sessions can write one ledger at the same time. Every write uses the
  ledger's generation compare-and-swap. A stale generation is a terminal
  conflict; re-read and reconcile instead of overwriting.

## When to ask

Ask only when one of these comes up:

1. Product decisions during discovery or grooming, followed by approval of the
   final ticket or slice plan.
2. Accepting a risk on a NO-GO.
3. The merge. It is always the operator's.
4. Installing an evaluated delivery improvement candidate. Retro acceptance is
   not installation approval.
5. Anything a stage stops on because required evidence is missing or
   contradictory.

Ask one question at a time, with a recommended answer, worded so that "yes"
accepts it. Record the answer in the ledger.

Never ask for a fact you can look up, and never ask whether to go on to the next
step.

## Waiting

- **For a pipeline, a build, or a deploy.** Observe it once. For an MR, read
  `head_pipeline` from the forge change view for `<iid>`, not the branch's
  pipeline. If it is still running, set `[waiting: <what>]`, end the turn, and
  give the resume command. Do not sleep or poll in the same turn.
- **For a person** (a merge, a reporter, an answer): do not poll. Set
  `[waiting: <what>]`, ask, and end the turn. Their reply resumes the loop.
- **Never retry a failed stage.** A failure is a terminal stop, exactly as when
  the stage runs on its own. Waiting with a time limit for something still
  running is not a retry.

## Context

One conversation cannot hold a whole epic. When a key finishes and the
conversation is long, end the turn and suggest a fresh chat with
`/delivery auto <EPIC>`. The ledger holds everything the next session needs.

## Ending a turn

Every turn auto ends says three things:

- What was done, by key.
- What the run is waiting on, if anything.
- The single command that resumes it.

When every key is done or stopped, run retro without another checkpoint. Under
continuous authorization, evidence-backed delivery-skill proposals are
accepted for investigation and other proposals are recorded as backlog; none
is applied. Follow `improve.md` immediately for every qualifying accepted
delivery lesson, prepare and evaluate the candidate, show its installation
checkpoint, and end the turn. `/delivery auto` never answers that checkpoint.
When no such proposal exists, or after the candidate is
rejected or installed in a later chat, give the epic's closing brief: keys, MRs,
merges, stops, and accepted retro proposals.

## Ledger writes

- Approvals: `continuous-delivery: yes`, every merge confirmation, and every
  exact improvement installation or rollback command.
- Decisions: `auto started`, every `dispatched <KEY> to <worktree>`, automatic
  archive, retro proposal disposition, and every candidate prepared.
- Keys: `[waiting: <what>]` while waiting, replaced by the next status.
- Everything each stage spec writes, as if its verb had been run.

## Terminal stops

| Stop | Message | Next command |
|------|---------|--------------|
| Review rounds | Three review rounds without a ready verdict on !<iid> | `/delivery review <iid>` after deciding |
| Every key blocked | Every remaining key waits on a blocker that is not merged | `/delivery status <EPIC>` |
| A stage stopped | Whatever that stage's stop says | Its next command |
| Interrupted execute | Execute stopped before a merge request existed | `/delivery execute <KEY>` |

## Never

- Merge, or set an MR to merge when its pipeline succeeds.
- Create work items outside the approved verified groom drafts, or transition,
  label, or close work items.
- Run independent ready tickets sequentially when isolated dispatch is
  available.
- Treat continuous authorization as permission to merge, accept risk, bypass a
  gate, or install a candidate.
- Retry a failed stage.
- Skip a correctness, security, test, review, or readiness gate because auto is
  running.
- Install or rollback a delivery-skill version; `auto` may prepare a candidate
  but never supplies improvement approval.
