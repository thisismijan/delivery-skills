# Auto

`/delivery auto` runs the whole lifecycle from wherever a run is. Approval of
the groomed ticket or slice plan is standing authorization to draft, build,
review, publish review notes, archive, verify, write the retro, and prepare
evidence-backed improvement candidates for that run. It also authorizes bounded
fix-forward work when a pipeline failure is attributable and the repair stays
inside the frozen scope and permitted writes, and landing a change once a
person has approved it on the forge and its pipeline is green (see **Land**).
It is not authorization to merge any other way, accept a release risk, retry
provider CI, install an improvement candidate, override a failed gate, or
expand scope.

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
   Verify `SDLC-CONSTITUTION.md` with `scripts/sdlc-constitution.ts preflight`.
2. **Frozen run contract.** Once the groomed plan is approved, freeze it with
   `scripts/sdlc-constitution.ts freeze <draft.json>` into
   `.delivery/runs/<id>.run-contract.json`. Record the path and hash in the
   ledger. Before each later stage, run
   `scripts/sdlc-constitution.ts check <run-contract.json> <stage> [ticket-key]`.
   Non-zero exit is a terminal stop. Do not invent tickets, goals, or writes
   the contract does not name. For an existing approved run without this file,
   reconstruct the draft from durable ticket, dependency, acceptance,
   approval, and ledger artifacts, then freeze it before progressing. Stop if
   those artifacts do not prove the exact scope.

   The freeze input is version 1 and contains `runId`, `planVersion`, `goal`,
   `scope`, `nonGoals`, `tickets` (`key`, `title`, one to three `acceptance`
   criteria, `blockedBy`), `permittedWrites`, every `humanOwned` boundary, and
   `approval` (`who`, exact `words`, ISO `at`). A later plan also records
   `supersedesHash`, `reason`, and `affectedInvariant`. `permittedWrites`
   includes `change-land` so auto may land approved, green changes; a contract
   frozen without it leaves every merge to the operator.
3. **Continuous authorization.** Only after the frozen contract exists, record
   `continuous-delivery: yes`, scoped to this run. The authorizing words are the
   `/delivery auto` invocation or the operator's explicit approval of the
   groomed plan in the full-epic path. This standing authorization covers the
   non-human stages named above. Do not ask a second build, test-seam,
   review-publication, archive, retro, or improvement-preparation question.
4. Append a Decision: `auto started at <stage> for <keys>`.

## The loop

Repeat until every key is done, stopped, or waiting on a person:

1. Reconcile the ledger with the real state.
2. Pick the key to work on (Choosing a key, below).
3. Check the capabilities that stage needs with `checkCapabilities`. Re-check
   at each stage boundary so a later capability is checked when that stage
   begins. Check the frozen run contract for that stage before mutating.
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
| `[executing]` | Recover: review once a matching merge request exists; wait while a live owner still builds; resume execute directly after an interruption because continuous authorization is already recorded | Nothing |
| `[reviewed-blocked !N]` | Address comments, then review the new head | Nothing |
| `[addressed !N]` | Review the new head | Nothing |
| `[ready !N]` | Release readiness, which reads the comments on the change before any GO | Nothing |
| `[no-go !N]` | Classify the readiness blockers: address code/comment blockers (every unanswered comment on the change is a comment blocker, fixed in one batched round) then run ship again; wait on pipeline/conflicts; ask only for operator-owned risk acceptance | Whether to accept an operator-owned risk |
| `[go !N]` | Before landing, read the comments on the change again, then land it (see **Land**). `landed` sets `[merged !N]`; `wait` sets `[waiting: <reason>]`; `stop` sets `[no-go !N]` for a new comment or a moved head, otherwise `[stopped: <reason>]` | Nothing; a person approves the change on the forge |
| `[merged !N]` | Follow `pipeline-monitoring.md` for the exact merged revision; after the default-branch pipeline passes, archive, wait for deploy, then verify | Nothing |
| `[verified !N]` | The key is done. Choose the next key; when none is left, retro | Nothing |
| `[regressed !N]` | Nothing. Show the rollback recommendation or the bug report | Nothing; the operator decides |
| `[retro done]` | Prepare an improvement candidate for any accepted lesson targeting delivery; otherwise the run is done | Installing the exact candidate |
| `[stopped: <reason>]` | Nothing. Never retry | Nothing; show the next command from Stops |
| `[waiting: <what>]` | Check whether it has arrived, then carry on or keep waiting | Nothing new |

**Review rounds.** Review, then address-comments, then review again counts as one
round. After three rounds without `[ready !N]`, stop and ask the operator how to
proceed. Unanswered comments are answered by one `/address-comments` round
that takes every open comment on the change together, never one round per
thread, and that round counts as one review round.

**Archive.** Resolve the change with `factory/scripts/find-change.ts`; exactly
one match is required, so `MDF-1234` can never select `MDF-12345`. If it is
already under `openspec/changes/archive/`, skip the archive. Otherwise run
`/openspec-archive <change-name>` under the run's continuous authorization.
Commit and push the archive through the repository's normal protected-branch
path; open a follow-up change request when direct push is unavailable. That
change lands through the same gate with `kind: "archive"`, which needs no
readiness verdict but stops if any file is outside `openspec/`. Archive
publication may wait for its approval, but it does not block deployed
verification, retro, or improvement preparation for the already-merged product
change.

**Land.** At `[go !N]`, read the comments on the change again. Then write the
land input and run, under the run's continuous authorization:

```
bun "$FACTORY_ROOT/scripts/forge-provider.ts" land <repoRoot> \
  "$FACTORY_ROOT/runtime-manifest.json" <land-input.json>
```

The input names `ref`, the `headRevision` the GO was given at, `kind`
(`change`), `ticketKey`, `ledgerPath`, `runContractPath`, `readNoteIds` (every
comment id readiness read), and `approved: true`. The command re-reads the
change, its approvals, and its comments, and merges only when all of these
hold at that one head: open and not a draft; approved by at least one person
with every approval rule met; the latest pipeline passed; no conflicts; no
comment readiness did not see; a readiness GO at that head in the ledger;
`continuous-delivery: yes` in the ledger; and a run contract that permits
`change-land` for the ticket. It squash-merges with the head as a guard and
removes the source branch where the forge supports it. Exit 0 is `landed` with
the merged revision, 3 is `wait`, and 1 is `stop`; each prints plain reasons.
Record the decision and reasons in the ledger. `land` runs only through the
executable adapter; with session tools only, the merge stays the operator's.
Never set the change to merge when its pipeline succeeds, and never merge any
other way.

### Choosing a key

- One key in scope: that key.
- An epic: the keys whose blockers are all merged and that are not done, stopped,
  or handed off.
- More than one key can start now: automatically fan out the ready wave in
  batches of at most `maxParallelWorktrees` concurrent worktrees. Read that
  limit from `bun "${FACTORY_ROOT}/scripts/config.ts"` (`MAX_PARALLEL_WORKTREES`,
  default 4). Remaining ready keys stay ready-now until the current batch
  settles, then the coordinator dispatches the next batch.
  Serial execution is allowed only for a real blocking edge recorded in the
  approved plan.
  1. Resolve one absolute shared `DELIVERY_STATE_ROOT` from the primary
     worktree. The coordinator remains the only writer of the run ledger.
     Choose the current batch with
     `bun "${FACTORY_ROOT}/scripts/config.ts" ready-wave '<keys-json>'`.
     Reserve only that batch in one compare-and-swap write before dispatch.
  2. Create one detached git worktree per dispatched key from the recorded base.
     Keep worktrees outside one another. Never reuse a dirty or occupied path.
     Use argv-equivalent execution, not a shell-built string:
     `git worktree add --detach <path> <full-base-sha>`. Then copy the local
     files the operator confirmed at init with
     `bun "${FACTORY_ROOT}/scripts/worktree-files.ts" copy <repoRoot> <path>`.
     It copies nothing when no list was confirmed. A failure stops only that
     key, naming the file, before any worker starts in it. Never copy other
     files into a worktree. The worker creates the deterministic ticket branch
     before its first commit.
  3. Before the first batch, run
     `bun "${FACTORY_ROOT}/scripts/sandbox-run.ts" check <repoRoot>`. Exit 3
     means no sandbox was confirmed: dispatch workers as below. Exit 1 means a
     confirmed sandbox cannot run (malformed file, engine missing, image
     missing): stop the fan-out once with its reasons. Never fall back to plain
     worktrees when a sandbox was confirmed. Exit 0 means start each worker as
     its own background process with
     `bun "${FACTORY_ROOT}/scripts/sandbox-run.ts" run <repoRoot> <path> <state-root> <run-id> <KEY>`
     instead of `agent.dispatch`. It runs the confirmed worker command in a
     container that mounts only that worktree, its git data, the state root
     read-only, the run's journal folder, and the pack read-only. It passes
     only the confirmed variable names, runs the confirmed setup steps inside
     the container first, and removes the container when the worker ends.
     Otherwise, dispatch one mutating isolated worker per worktree through the
     runtime's `agent.dispatch` capability. Its command is `/delivery auto <KEY>`, its cwd
     is that worktree, and its environment includes the shared state root plus
     `DELIVERY_WORKER_JOURNAL=<state-root>/workers/<run-id>/<key>.md`. Give it
     the reserved ledger generation and immutable key row. A worker writes only
     its own journal through `ledger-store.ts`; it never mutates the run ledger.
     It writes its journal at every step boundary and immediately before and
     after any command that may run for minutes, so the journal is its
     heartbeat.
  4. Give each worker the fan-out brief and forbid merge (the coordinator
     lands), tracker transitions,
     sibling worktrees, and work outside its key.
  5. Start every worker in the current batch before awaiting any one of them.
     Write `<state-root>/workers/<run-id>/dispatch.json` with each key and its
     ISO `dispatchedAt`. While the batch runs, check it with
     `bun "${FACTORY_ROOT}/scripts/worker-watch.ts" <workers-dir> <dispatch.json>`
     whenever the coordinator wakes. A worker whose journal has not changed for
     `workerIdleMinutes` (`WORKER_IDLE_MINUTES`, default 20) is idle: exit 3
     names it. Cancel that worker if the runtime can; for a sandboxed worker,
     `bun "${FACTORY_ROOT}/scripts/sandbox-run.ts" stop <repoRoot> <run-id> <KEY>`
     removes its container and so ends its processes. Set its key to
     `[stopped: <reason>]` with the reason worker idle, record the minutes in Decisions, close its
     worktree, and ignore anything it writes afterwards. Its siblings keep
     running. Never restart an idle worker in the same turn.
     Reconcile each result from its journal, git, and forge, not from prose.
     After the batch settles, apply validated key updates to the run ledger in
     one coordinator compare-and-swap write, then dispatch the next batch of
     remaining ready keys. A malformed, missing, or conflicting result stops
     that key without cancelling successful siblings.
  6. Append `dispatched <KEY> to <worktree>` for each key. After a worker
     stops, close its worktree with
     `bun "${FACTORY_ROOT}/scripts/worktree-close.ts" <worktree-path>`. It removes
     the folder only when nothing is uncommitted or untracked and the last
     commit is on a remote branch. Otherwise it keeps the folder and prints why;
     append `kept worktree <path> for <KEY>: <reasons>` to Decisions. Never
     remove a worktree any other way, and never force it.
- If the runtime cannot dispatch isolated mutating workers, stop once with the
  missing capability and the fan-out commands. Do not silently run an
  independent ready wave sequentially.
- Two sessions can write one ledger at the same time. Every write uses the
  ledger's generation compare-and-swap. A stale generation is a terminal
  conflict; re-read and reconcile instead of overwriting.

## When to ask

Ask only when one of these comes up, and only when the factory cannot decide
it as a simple, reversible, or discoverable choice:

1. Product intent during discovery or grooming that the codebase cannot
   answer, followed by approval of the final ticket or slice plan.
2. Accepting a risk on a NO-GO.
3. Approving the change on the forge. Auto lands it once it is approved and
   green; any other merge is the operator's.
4. Installing an evaluated delivery improvement candidate. Retro acceptance is
   not installation approval.
5. Anything a stage stops on because required evidence is missing or
   contradictory.

The factory decides facts, single viable paths, and local cheap reversible
defaults itself. Never ask for a fact you can look up, and never ask whether
to go on to the next step.

When an escalated choice has two or more viable product, recovery,
risk-response, or improvement options, follow `SKILL.md`'s **Human decision
brief**: options and trade-offs with no recommendation, then the withheld
recommendation after they answer, with a chance to change. Name the option
they should pick; do not word the question so that "yes" accepts a hidden
pick. Contradictory or unattributable recovery evidence remains a stop, not an
option. Record the settled choice in the ledger. Agent-owned decisions go in
the same log without asking.

## Waiting

- **For a pipeline, a build, or a deploy.** Observe it once. For a forge
  change, use the normalized `pipeline` from `forge-provider.ts read` for its
  ref, not a branch pipeline. Require `current: true`. If it is still running,
  follow `pipeline-monitoring.md`: reuse or create a matching host event
  subscription when available, set `[waiting: <what>]`, and end the turn. After
  merge, query the exact `revisions.merged` value with the normalized
  `pipeline` operation; the open-change pipeline does not prove the
  default-branch pipeline passed. Do not sleep or poll in the same turn.
- **For a person** (an approval, a merge, a reporter, an answer): do not poll. Set
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
- Decisions: `auto started`, every `dispatched <KEY> to <worktree>`, every
  land decision with its reasons, automatic archive, retro proposal disposition, and every candidate prepared.
- Keys: `[waiting: <what>]` while waiting, replaced by the next status.
- Everything each stage spec writes, as if its verb had been run.

## Terminal stops

| Stop | Message | Next command |
|------|---------|--------------|
| Review rounds | Three review rounds without a ready verdict on !<iid> | `/delivery review <iid>` after deciding |
| Every key blocked | Every remaining key waits on a blocker that is not merged | `/delivery status <EPIC>` |
| A stage stopped | Whatever that stage's stop says | Its next command |
| Interrupted single-step execute | Execute stopped before a merge request existed and continuous authorization is absent | `/delivery execute <KEY>` |

## Never

- Merge any way except `forge-provider.ts land`, or set an MR to merge when its
  pipeline succeeds.
- Create work items outside the approved verified groom drafts, or transition,
  label, or close work items.
- Run independent ready tickets sequentially when isolated dispatch is
  available.
- Treat continuous authorization as permission to merge without the land gate,
  accept risk, bypass a gate, or install a candidate.
- Retry a failed stage.
- Skip a correctness, security, test, review, or readiness gate because auto is
  running.
- Install or rollback a delivery-skill version; `auto` may prepare a candidate
  but never supplies improvement approval.
