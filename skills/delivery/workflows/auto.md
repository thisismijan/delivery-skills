# Auto

`/delivery auto` runs the whole lifecycle from wherever a run is, and stops only
for decisions that belong to the operator. It adds no stage of its own. For each
key it reads the status in the ledger, looks up the next step below, and runs the
same stage spec the matching single-step verb would.

The single-step verbs use the same table to tell the operator what to type next.

## Inputs

| Argument | Starts with |
|----------|-------------|
| none | The run already in this conversation. If there is none, ask once for an idea, a key, or an MR iid |
| an idea, a file, or a link | A new run. Discovery if the idea names no destination (ask once), otherwise groom |
| an epic key | Every key in the epic's ledger |
| a ticket key | That key. If it has no ledger and its Jira type is Bug, intake (ask once) |
| an MR iid | Review for that MR |

## Start

1. Run the conductor's Phase 1: find or create the ledger and reconcile it.
2. **Build approval.** If the ledger has no `build-without-asking` approval for
   this run, ask once:
   "After each ticket is drafted, should I build it straight away, or show you
   the draft first? Recommended: show me the draft first."
   Record the answer in Approvals, scoped to the run, as
   `build-without-asking: yes` or `build-without-asking: no`. A later
   `/delivery auto` on the same ledger reuses it and does not ask again.
3. Append a Decision: `auto started at <stage> for <keys>`.

## The loop

Repeat until every key is done, stopped, or waiting on a person:

1. Reconcile the ledger with the real state.
2. Pick the key to work on (Choosing a key, below).
3. Look up its next step in the table and run it.
4. Write the ledger, then go back to 1.

Between steps, do not ask whether to continue. Continue.

### Next step by status

| Status | Next step | Asks the operator |
|--------|-----------|-------------------|
| no ledger yet | Discovery if the idea names no destination, otherwise groom | Discovery's yes, or groom's own gates |
| `[discovering]` | Resume discovery | The one-pager yes |
| `[triage: needs-info]` | Nothing until the reporter answers | Nothing; it is waiting on the reporter |
| `[triage: ready]` | Draft | Nothing |
| `[triage: wont-fix]` | Nothing | Nothing; the key is done |
| `[triage: duplicate <KEY>]` | Nothing | Nothing; the key is done |
| `[groomed]` | Draft, once every blocker is `[merged !N]` or later | Nothing |
| `[drafted]` | Execute | The draft, unless `build-without-asking: yes` |
| `[executing]` | Review once the MR exists; while the build runs, wait | Nothing |
| `[ready !N]` | Release readiness | Nothing |
| `[no-go !N]` | Address the blockers with address-comments, then review again | Whether to accept a risk instead, when every blocker is a risk only the operator can accept |
| `[go !N]` | The operator merges | The merge |
| `[merged !N]` | Archive the change, wait for the deploy, then verify | The archive |
| `[verified !N]` | The key is done. Choose the next key; when none is left, retro | Nothing |
| `[regressed !N]` | Nothing. Show the rollback recommendation or the bug report | Nothing; the operator decides |
| `[retro done]` | Prepare an improvement candidate for any accepted lesson targeting delivery; otherwise the run is done | Installing the exact candidate |
| `[stopped: <reason>]` | Nothing. Never retry | Nothing; show the next command from Stops |
| `[waiting: <what>]` | Check whether it has arrived, then carry on or keep waiting | Nothing new |

**Review rounds.** Review, then address-comments, then review again counts as one
round. After three rounds without `[ready !N]`, stop and ask the operator how to
proceed.

**Archive.** Find the change name: the folder under `openspec/changes/` whose
name starts with the key in lower case. If it is already under
`openspec/changes/archive/`, skip the archive. Otherwise ask:
"!<iid> is merged. Archive <change-name> now? Recommended: yes." On yes, record
the approval and run `/openspec-archive <change-name>`. If that leaves changes in the
working tree, tell the operator they need committing; do not commit them.

### Choosing a key

- One key in scope: that key.
- An epic: the keys whose blockers are all merged and that are not done, stopped,
  or handed off.
- More than one key can start now: ask once per wave.
  "<n> tickets can start now: <keys>. Run them one after another here, or fan
  them out to separate worktrees? Recommended: fan out."
  - **Fan out**: emit one fan-out brief per key with `START` set to
    `/delivery auto <KEY>`. Append a Decision `handed off <KEY>` for each. End
    the turn. A later `/delivery auto <EPIC>` skips handed-off keys until their
    status shows they are done.
  - **One after another**: work them in ledger order.
- Two sessions can write one ledger at the same time. Re-read the ledger before
  every write, and change only the row of the key you are working on.

## When to ask

Ask only when one of these comes up:

1. A gate a stage already has: discovery's yes, groom's grilling and ticket
   approval, a decision `/mr-review` puts to the operator.
2. The draft, when `build-without-asking` is `no`.
3. Accepting a risk on a NO-GO.
4. The merge. It is always the operator's.
5. The archive.
6. Fan out or one after another.
7. Installing an evaluated delivery improvement candidate. Retro acceptance is
   not installation approval.
8. Anything a stage stops on.

Ask one question at a time, with a recommended answer, worded so that "yes"
accepts it. Record the answer in the ledger.

Never ask for a fact you can look up, and never ask whether to go on to the next
step.

## Waiting

- **For a pipeline, a build, or a deploy.** Check every 60 seconds for up to
  30 minutes. For an MR, read `head_pipeline` from `glab mr view <iid> --output
  json`, not the branch's pipeline: with merged-results pipelines the two
  differ. For the default branch after a merge, use
  `glab ci status --branch <default branch>`.
  Set `[waiting: <what>]` while waiting. If it has not finished after 30 minutes,
  end the turn and give the resume command.
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

When every key is done or stopped, run retro. If it accepted a qualifying
proposal targeting delivery, follow `improve.md` to prepare and evaluate the
candidate, show its checkpoint, and end the turn. `/delivery auto` never answers
that checkpoint. When no such proposal exists, or after the candidate is
rejected or installed in a later chat, give the epic's closing brief: keys, MRs,
merges, stops, and accepted retro proposals.

## Ledger writes

- Approvals: `build-without-asking`, every merge confirmation, every archive yes.
- Decisions: `auto started`, every `handed off <KEY>`, every wave's fan-out
  choice, and every candidate prepared.
- Keys: `[waiting: <what>]` while waiting, replaced by the next status.
- Everything each stage spec writes, as if its verb had been run.

## Terminal stops

| Stop | Message | Next command |
|------|---------|--------------|
| Review rounds | Three review rounds without a ready verdict on !<iid> | `/delivery review <iid>` after deciding |
| Every key blocked | Every remaining key waits on a blocker that is not merged | `/delivery status <EPIC>` |
| A stage stopped | Whatever that stage's stop says | Its next command |

## Never

- Merge, or set an MR to merge when its pipeline succeeds.
- Create, transition, label, or close Jira issues.
- Spawn worktrees or agents. Fan-out is a brief the operator acts on.
- Archive without a yes for that change.
- Retry a failed stage.
- Skip a stage's own gate because auto is running.
- Install or rollback a delivery-skill version; `auto` may prepare a candidate
  but never supplies improvement approval.
