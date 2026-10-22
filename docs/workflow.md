# Workflow

`/delivery` is the only command to remember. It routes into stage skills,
records state under the target repository's `.delivery/runs/`, and stops for
operator-owned decisions. The live cheat-sheet is `/delivery help`, copied
from `skills/delivery/SKILL.md`.

## Path

1. **Install and doctor.** [Getting started](getting-started.md).
2. **Init.** Confirm one work-item provider. Local files need no service.
3. **Shape.** `/delivery <idea>` or `/delivery discover` / `groom` until the
   atomic ticket plan is honest.
4. **Approve the plan.** That is the single routine authorization for the run.
   It does not authorize merge, tracker status, risk acceptance, or skill
   install.
5. **Auto.** `/delivery auto <key>` creates approved items, fans out
   independent tickets into isolated worktrees (at most 4 at a time unless
   you set `MAX_PARALLEL_WORKTREES`), drafts, executes, reviews, and
   monitors the exact-head pipeline without polling.
6. **You merge.** Delivery never merges, closes, or resolves threads.
7. **After merge.** Delivery monitors the exact merged revision on the default
   branch. An attributable in-scope failure fixes forward through a new
   reviewed change within a bounded budget; ambiguous, unrelated, transient,
   out-of-scope, or exhausted failures escalate. After success it runs
   `/delivery archive`, `verify`, `retro`, and optionally `improve` with a
   separate install/rollback approval.

Resume with `/delivery <KEY>` or `/delivery auto <key>`. Do not skip a failed
gate.

## Pipeline checkpoints

| Checkpoint | Evidence | On success | Repairable failure |
|------------|----------|------------|--------------------|
| Open change | Current pipeline for the exact change head | Continue release readiness and wait for human merge | Repair the same branch, rerun invalidated gates, and monitor the new head |
| After merge | Default-branch pipeline for the exact merged revision | Archive, verify deployment, and continue to retro | Open a new draft recovery change and run the normal review and readiness path |

Missing or running evidence is a wait, not a pass. Delivery uses a host event
subscription when available; otherwise it ends with `/delivery auto <KEY>` so
you can resume later. It does not keep a process alive to poll.

A failure fixes forward only when evidence attributes it to the delivered
change, the repair stays inside the frozen run contract, and the attempt budget
has not been exhausted. Transient, unrelated, ambiguous, out-of-scope, and
exhausted failures stop with an evidence-backed escalation. Retrying a provider
job, reverting, and merging remain human decisions.

## Review bots

Some teams run a review bot: an automated reviewer that posts threads only
after a change is posted. Set `DELIVERY_REVIEW_BOTS` to its forge author
names (comma-separated; empty turns this off) and delivery treats its threads
as review input that must be answered before the change is queued:

- Execute opens the draft change on the first satisfied holdout review, so the
  bot sees the change as early as possible.
- Release readiness reads the bot's threads at the current head. An unanswered
  one (started by the bot, no reply after its last note) is a NO-GO comment
  blocker. Readiness checks again before you queue a GO change.
- If the bot has not commented yet, delivery waits once for that head
  (`[waiting: <what>]` with `review bot <head>`), ends the turn, and continues on the next pass.
  It never polls and never blocks forever on a bot that skips a change.
- `/address-comments` fixes every open bot thread in one round, with the usual
  test-first and green gates, replies once per thread under your own forge
  identity, and never resolves a thread. That round counts as one of the
  three review rounds.

See [the GitLab provider guide](../providers/gitlab/README.md) for an example
configuration.

## Verbs

| Command | Role |
|---------|------|
| `/delivery auto [idea \| KEY \| iid]` | Whole lifecycle; stops only for your decisions |
| `/delivery status [KEY]` | Where the run is, and what to type next |
| `/delivery doctor` | Live readiness |
| `/delivery init` | Target bootstrap and work-item confirmation |
| `/delivery discover` / `triage` / `groom` | Shape work |
| `/delivery draft` / `execute` | Spec then build (execute is the build approval) |
| `/delivery review` / `address` / `ship` | Review and go/no-go |
| `/delivery archive` / `verify` / `retro` | After you merge |
| `/delivery improve …` | Skill candidates; apply/rollback stay human-owned |
| `/delivery help` | Cheat-sheet |

## Host difference

- **Claude Code:** mutating stages run after the adapter verifies its
  PreToolUse hook and you reload the session.
- **Cursor:** mutating stages run after the adapter verifies `hooks.json` and
  you reload Cursor. Until doctor shows Mutation guard as ready, only
  read-only discovery, diagnosis, and review briefing run. Do not merge,
  close, force-push, hard-reset, or mutate tracker state from the agent.
- **Session tools:** if the host exposes GitHub, GitLab, or Atlassian MCP
  tools, `/delivery doctor` records them and later stages prefer those tools
  for mapped operations. Merge, close, approve, and work-item status stay
  unused even when the host offers them.

## Stops that always need a human

- Product decisions, then one final plan approval
- Merge, or named release-risk acceptance for an exact head
- Failed-gate override
- Live skill install or rollback
- Tracker status transitions (open, close, done)

When two options are viable, delivery presents a decision brief: context,
pros/cons, DSA and system-design notes, and a recommendation. Ask for a missing
fact directly; do not invent a false choice.

Pipeline waits use host event subscriptions when available and otherwise end
the turn with one resume command. Delivery never sleeps or repeatedly polls.
It never treats an MR pipeline as proof that the merged default-branch revision
passed.
