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
   independent tickets into isolated worktrees (at most `maxParallelWorktrees`
   at a time, default 4, override with `MAX_PARALLEL_WORKTREES`), drafts,
   executes, reviews, and monitors the exact-head pipeline without polling.
6. **You merge.** Delivery never merges, closes, or resolves threads.
7. **After merge.** Delivery monitors the exact merged revision on the default
   branch. An attributable in-scope failure fixes forward through a new
   reviewed change within a bounded budget; ambiguous, unrelated, transient,
   out-of-scope, or exhausted failures escalate. After success it runs
   `/delivery archive`, `verify`, `retro`, and optionally `improve` with a
   separate install/rollback approval.

Resume with `/delivery <KEY>` or `/delivery auto <key>`. Do not skip a failed
gate.

## Model spend

Live dispatch still uses the required capability, then the catalogue, then an
exact advertised model. Diagnostic shadow profiling defaults off. Set
`ROUTING_PROFILING=always` only when collecting evaluation evidence; a cheaper
shadow recommendation is recorded, never dispatched. Scripted skipped workers
are still recorded, and the run scorecard counts them without estimating
tokens saved.

`/code-review-max` starts independently adjudicated lenses on the standard
tier. Release-readiness lens subagents use that same resolved standard model;
`review-fanout.ts readiness` skips those subagents on an empty or proven small
reversible measured diff. The main conversation still decides GO or NO-GO.
`review-fanout.ts` chooses no lenses when the measured diff has no reviewable code, two essential lenses for a proven small
reversible change (at most 2 files, fewer than 50 changed lines, two-way, no
Data/Contract/Config/Auth/Infra) or a contained one (at most 6 files, fewer
than 400 lines, two-way, none of those surfaces and no dependency change), and
all four lenses otherwise. Invalid input fails closed. Only a candidate at
Medium or above is verified by the main conversation; all-Low candidates go to
one standard-tier subagent.

`/address-comments` still classifies every in-scope comment. Resolved, empty,
acknowledgement-only, mention-only, URL-only, and emoji-only notes, and a
suggestion already in the file, never start the comment assessor. A
whole-body suggestion fence is applied without the implementer. A round that
changes the commit still runs cumulative gates and frontier holdout review. A
reply-only round whose commit is unchanged stays draft and continues to dual
review instead of repeating holdout on the same code. Dual review remains the
only authority that may mark the change ready.

`/execute` applies a proven rename, unused or unique missing import, or
format-only unit without the test-writer or the implementer. That includes a
unique Python parameter or local, a unique Java field, a Java type whose
listed file name matches, a unique TypeScript missing import, and format-only
through a repo Prettier, Ruff, or google-java-format binary when names and
literals stay identical. Extract method, inlining, and a formatter that
changes names still use the implementer. Green, lint, typecheck, and holdout
still run.

`/groom` and `/draft` skip their assessors and analysts when a script already
has the verdict: a ticket that verifies, a size warning, recorded blockers,
or named authentication, authorization, secrets, credentials, OAuth, OIDC,
JWT, or a data, schema, or database migration. OpenSpec authoring and
holdout still run when the ticket proceeds.

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
