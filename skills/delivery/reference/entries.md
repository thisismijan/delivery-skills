# Entry details

Read this when Phase 0 has chosen an entry other than Auto, Help, Doctor, or
Initialize, and before you run `next-action.ts`.

## Routing checks

Two routing checks before you start a bare-key or prose entry:

- **A bare key whose work item type is Bug** and that has no reproduction on
  it: recommend the intake on-ramp and ask once. The default is intake.
- **Prose that names no destination** (no user, outcome, or done condition you
  can state in one sentence): recommend `discover` and ask once. The default is
  Stage 1, because groom grills anyway.

## Next-action context

Pass `-` to `next-action.ts` when there is no ledger. The context records
execute-recovery evidence, continuous authorization, blocker state, NO-GO
classification, and remaining run keys. Missing context fails closed for a
guarded transition. An empty `blockedBy` list is already satisfied: pass
`"blockersMerged": true` when the ticket records no blockers, or after every
recorded blocker has merged. Pass `false` while any recorded blocker remains.

## Executing recovery

When the reconciled status is `[executing]`, recover before selecting from the
table. Pass the owner, matching or conflicting merge request, and whether
branch, gate, or dirty-worktree evidence can be attributed. A matching open
merge request records the iid and proceeds to review. No active owner and no
merge request is an interrupted stop. A single-step run offers
`/delivery execute <KEY>` because typing execute is its approval to build. A
run with recorded `continuous-delivery: yes` resumes execute directly without
another approval. A live owner with no merge request waits. Evidence that
cannot be attributed escalates; never discard it and never guess.

## Single steps

Each runs one step, writes the ledger, and ends with one line:
`Next: /delivery <verb> <arg>`, taken from the next-step table in
`workflows/auto.md` for the key's new status.

| Verb | Follow | Invoke |
|------|--------|--------|
| `groom <idea>` | `epic-to-backlog.md`, groom only. Do not continue to draft | `/groom <idea>` |
| `draft <KEY>` | `ticket-to-mr.md`, draft only | `/draft <KEY>` |
| `execute <KEY>` | `ticket-to-mr.md`, execute only. Typing this verb is the approval to build | `/execute <KEY>` |
| `review <iid> [KEY]` | `mr-review-to-ready.md`, then record the review verdict | `/code-review-max !<iid>`, then `/mr-review <iid>` in this same conversation, through the review provider |
| `address <KEY>` | `mr-review-to-ready.md`, address-comments only | `/address-comments <KEY>` |
| `archive <KEY or change-name>` | Archive, below | `/openspec-archive <change-name>` |
| `improve [KEY or all]` | `improve.md`, prepare only; never edits the live skill | Build an isolated candidate, evaluate it, then show the approval checkpoint |
| `improve status` | `improve.md`, status only | List immutable candidates and rollback versions |
| `improve apply\|reject <candidate>` | `improve.md`, exact candidate decision | Apply only on the explicit `apply` command; reject changes no managed file |
| `improve rollback <version>` | `improve.md`, exact version decision | Snapshot current state, then restore only the approved version |

**Archive.** Resolve a key to its change with
`factory/scripts/find-change.ts <KEY> openspec/changes`. Exactly one match is required;
none or several is a terminal stop that names what was found. Its MR must be
merged; otherwise stop: "!<iid> is not merged; archive after the merge". Typing
this verb is the operator's yes. If the archive leaves changes in the working
tree, say they need committing; do not commit them.

## Entry 0 — Discovery

1. Follow `discovery.md`. It ends with a one-page brief the operator approves
   with an explicit yes. "Sounds good" is not a yes.
2. The approved brief is the Stage 1 argument. Continue in this session: groom
   needs the discovery as a primary source, not a summary.

## Entry I — Bug intake

1. Follow `intake.md`. It ends with a recommended state (`ready`,
   `needs-info`, `wont-fix`, or `duplicate <KEY>`) and, for `ready`, a brief.
2. On `ready`, once the brief is on the ticket, continue with Entry B for the
   same key. Every tracker change the recommendation implies is left to the
   operator.

## Entry A — Full epic

1. Read and follow `epic-to-backlog.md` with the idea/file/text argument.
   Invoke `/groom …` as that workflow specifies; honor its grilling
   and final plan approval. That approval starts continuous mode for this run;
   record it and continue without another stage checkbox. Prefer **max
   parallelism** and **small-context atomic
   slices** (at most ~25% of a context window for the complete ticket,
   including tests and review; blockers only when real - see that workflow).
2. Compute the **ready-now** set (blocked-by empty / already merged). If more
   than one key, follow auto's isolated-worktree fan-out and start at most
   `maxParallelWorktrees` keys concurrently (from `scripts/config.ts`, default
   4). Do not ask whether to use serial execution. If isolated
   mutating dispatch is unavailable, stop with the capability remedy and
   runnable fan-out commands rather than silently executing the wave in
   sequence.
3. True blockers only: run those serially (ticket-to-mr → review → release
   readiness → land once approved and green, or a human **merge** outside
   auto), then fan out whatever they unblock.
4. Further waves when the operator reports merges/skips. Update the ledger
   first, then recompute ready-now from it.
5. Epic-level closing brief when done: keys, MR iids/merges, stops, archive
   status, retro, and any prepared improvement candidate. Humans own approval,
   any merge outside the land gate, work-item closing, risk acceptance, and
   candidate installation.

## Entry B — Resume

1. Reconcile the ledger as Phase 1 says. When the status is `[executing]`,
   recover the owner, the merge request, and branch, gate, or dirty-worktree
   evidence before selecting. Select the next action with
   `scripts/next-action.ts <args> <status|-> [context.json]` (`-` when there is
   no ledger). The context must carry recovery and guarded-transition evidence.
2. If it stops, tell the operator why and do not write the ledger. An
   interrupted execute with no active owner and no merge request resumes
   automatically when the ledger records `continuous-delivery: yes`.
   Otherwise it offers `/delivery execute <KEY>` and does not run execute in
   this resume step; typing execute remains the single-step approval to build.
3. If `[executing]` has a matching open merge request, record the iid and
   proceed to review as the selected step.
4. If it returns a wait, end the turn. If it escalates because evidence
   cannot be attributed, stop; never discard that evidence and never guess.
5. If it returns a step, run only that selected step as the matching Single
   steps row (or auto, when that is the selected verb). Then print Next from
   the auto next-step table for the new status.
6. On terminal factory stop: record it in the ledger, brief, and end. No
   same-session poll/retry.

## Entry C — Review only

1. Follow `mr-review-to-ready.md` for the iid (and work-item key if provided), then
   record the review verdict.
2. If it ends ready, follow `release-readiness.md`.

## Entry D — Release readiness

1. Follow `release-readiness.md` for the iid. It ends with a GO or NO-GO brief.
   A GO always carries a rollback plan. The human merges; only `auto` lands.

## Entry W — Walkthrough

1. Follow `walkthrough.md` for the iid. It asks the operator a few questions
   about the change, one at a time, and records how each went under
   `.review/`. It is opt-in and never a gate: it changes no verdict, no
   ticket, and no ledger entry.

## Entry E — Post-merge verify

1. Follow `post-merge-verify.md` for the iid once the operator reports it
   merged and deployed. A regression becomes a recommended intake for a new
   bug, not a fix in this session.

## Entry F — Retro

1. Follow `retro.md` for the key or epic. It writes an evidence-backed
   engineering postmortem under `.delivery/runs/`, teaching the problem,
   attempts, counterexamples, design evolution, DSA choices, system-design
   trade-offs, complexity, and reusable lessons. It separately proposes changes
   to the environment and applies none of them.
2. An accepted proposal targeting this delivery skill becomes input to
   `/delivery improve <KEY>` in a later step. Every other accepted proposal
   becomes its own ticket or MR through the normal process.

## Entry G — Improve

1. Follow `improve.md` exactly.
2. Preparation and evaluation happen only under `candidates/`; the live skill
   remains unchanged while the approval question is open.
3. `apply` and `rollback` are the only mutating forms. The command itself is
   approval for that exact candidate or version; record it before mutation.
4. After a successful install or rollback, stop and require a new chat. Never
   continue the current run under instructions loaded before the change.

## Entry S — Status

Read-only. Read the ledger and the real state, then report:

- Every key with its status tag.
- Every decision waiting on the operator: the options, a recommendation, and
  what happens if nobody answers.
- The next command for each open key, from the next-step table in
  `workflows/auto.md`.
- Every kept worker worktree that still exists, with the reasons recorded
  when it was kept.
- Where the run's resume packet is. Run
  `bun "${FACTORY_ROOT}/scripts/resume-packet.ts" where <repo-root> <run-id>`,
  report the path it prints, and say that no packet has been written yet when
  it reports `"exists":false`. This mode writes nothing.
