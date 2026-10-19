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
   independent tickets into isolated worktrees, drafts, executes, reviews, and
   waits for merge.
6. **You merge.** Delivery never merges, closes, or resolves threads.
7. **After merge.** `/delivery archive`, `verify`, `retro`, and optionally
   `improve` with a separate install/rollback approval.

Resume with `/delivery <KEY>` or `/delivery auto <key>`. Do not skip a failed
gate.

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

## Stops that always need a human

- Product decisions, then one final plan approval
- Merge, or named release-risk acceptance for an exact head
- Failed-gate override
- Live skill install or rollback
- Tracker status transitions (open, close, done)

When two options are viable, delivery presents a decision brief: context,
pros/cons, DSA and system-design notes, and a recommendation. Ask for a missing
fact directly; do not invent a false choice.
