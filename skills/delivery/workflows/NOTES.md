# NOTES — delivery world

> Historical and non-actionable. Terminology only; this file cannot override
> `../SKILL.md` (the conductor), `auto.md` (the next-step table), or the
> current stage specs.

Raw notes on tools, channels, and canonical terms for the delivery workflows
under `workflows/`. Sharpen here when a term drifts; workflows reference these
names, they do not redefine them.

## Runtimes

The same delivery pack runs on any skill-capable runtime that can satisfy the
advertised capabilities. Factory skills, `/code-review-max`, and `/mr-review`
are pack commands. Mutation boundaries are **enforced** only when the runtime
declares an enforceable guard; otherwise mutating stages stay blocked.
Read-only stages still run.

A runtime-specific workflow helper may codify a large read-only fan-out when
the runtime advertises it. Delivery uses the same architecture through bounded
subagents and durable artifacts on every host. No runtime may put both sides
of a human approval gate in one background run.

## Channels and providers

| Channel | How we touch it | Writes allowed |
|---------|-----------------|----------------|
| **Tracker** | Tracker provider advertised by the runtime. Informational until a stage needs a real work-item read. | Factory: read plus **comment only**. Humans create and transition work items. |
| **Forge** | Runtime `forge.change` and `review.publish` capabilities, invoked only through `scripts/forge-provider.ts`. | Factory opens the draft change and posts notes. Humans merge, close, and resolve threads. Stage 3 marks a change ready after both review passes. Every `note` and `reply` checks the body before any adapter; bodies must resolve under `.review/` and must not look secret-bearing. |
| **OpenSpec** | `openspec/` in the **target repo**; `/opsx:*` commands | Factory authors changes under `openspec/changes/`. Humans run `/openspec-archive` after merge. |

Project is inferred from `git remote get-url origin` unless the forge provider is given an explicit project.

## Canonical command names

Do not confuse these review surfaces:

| Term | What it is | When |
|------|------------|------|
| **`/code-review-max !<iid>`** | Pack skill. Pinned, multi-lens correctness pass for a merge request. Ends with an iid + head-SHA marker. | After a ready merge request exists, before `/mr-review` in the same conversation. |
| **`/mr-review <iid>`** | Pack skill. Approach pass; validates the correctness pass against the current head, merges both passes, drafts under `.review/mr-<iid>/<head-sha>/`, and posts via `forge-provider.ts` `note` only after human confirm. | Same conversation or a fresh one using the matching pinned max artifact. |
| **Lightweight built-in review** | A host review command that is not the max pass. | **Not** the max pass `/mr-review` depends on; it has no fan-out or freshness marker. |

Factory stages (this clone's `skills/` + `factory/`):

| Command | Input | Stops when |
|---------|-------|------------|
| `/groom [file\|text]` | Idea / HLD / PRD | Drafts under the grooming output directory; **no** tracker, **no** git |
| `/draft <WORK-ITEM-KEY>` | Work-item key | Spec linked on branch + tracker comment (`SPEC_LINKED`), or terminal clarify/reject/escalate |
| `/execute <WORK-ITEM-KEY>` | Work-item key (invocation = approval to build) | Ready MR after holdout approve, or escalate (no MR / no merge) |
| `/address-comments <WORK-ITEM-KEY>` | Work-item key with existing open MR | Comments actioned + cumulative holdout; never merges |
| `/openspec-archive <change>` | Change name | Human-only, post-merge |
| `/delivery improve <KEY\|all>` | Accepted delivery lessons | Builds and evaluates an isolated candidate; never installs it |
| `/delivery improve apply <candidate>` | Exact evaluated candidate | Operator approval to snapshot and install that candidate |
| `/delivery improve rollback <version>` | Exact rollback version | Operator approval to snapshot current state and restore that version |

## Paths that matter

| Path | Meaning |
|------|---------|
| Target repo cwd | Where the runtime is opened; holds `openspec/`, app code, and the grooming output directory |
| grooming output directory | Groom outputs (ticket drafts, optional `prd.md`); gitignored. Printed by `groom-paths.ts` |
| `openspec/changes/<key>-…/` | OpenSpec change for one ticket |
| `.review/mr-<iid>/<head-sha>/` | Pinned review brief, max pass, and draft notes |
| `delivery-skills` clone | Canonical skill pack; `./install.sh` installs it into an explicit skills directory |
| `<state root>/candidates/` | Immutable proposed self-improvements, patches, and scorecards. Default: `<target repo>/.delivery/candidates/` |
| `<state root>/versions/` | Immutable rollback snapshots taken before install or rollback. Default: `<target repo>/.delivery/versions/` |

## Human gates (today, by design)

1. Approve groom slice breakdown (before any draft files).
2. Create work items from groom drafts (copy manually; set epic/parent links yourself).
3. Review OpenSpec on the draft branch before invoking execute.
4. Confirm `/mr-review` publish (post all / summary only / nothing).
5. Merge the MR.
6. `/openspec-archive` after merge.
7. Install or rollback a delivery-skill candidate. Retro acceptance and a green
   scorecard do not satisfy this gate.

## Factory non-goals (v1)

- No merge, close, or thread resolution through `scripts/forge-provider.ts`
- No tracker status transitions
- No automatic work-item create from groom
- No host-native port of a source framework

## Vocabulary

- **Target repo** — the product codebase under change, not this pack's own clone.
- **Slice** — one groom vertical slice = one useful outcome = one user story = one future work item = one OpenSpec change, with one primary contract and one to three acceptance criteria.
- **Brief** — checkpoint payload: decision-ready summary + links to artifacts; never the raw draft dump.
- **Push right** — do maximal prep before the human checkpoint; ask once, late.
- **Holdout** — frontier reviewer in execute / address-comments; sees outcome only, not implementer reasoning.
- **Draft MR** — execute's reviewed handoff; Stage 3 marks it ready only after both review passes.
- **Terminal stop** — draft/execute/address-comments end the run (clarify/reject/escalate); human re-invokes in a **new** session after fixing the input. No polling.
- **Blocker** — a slice that must merge before another can start; only when the dependency is real (shared seam, schema, contract). Not required on every epic.
- **Parallel wave** — a set of slices that do not block each other and can run concurrently in separate git worktrees. May be the entire epic (no blockers). If they depend on blockers, the wave starts only after those are merged.
- **Worktree** — a `git worktree` checkout (often named like `wt-<key>`) used so each parallel ticket has its own cwd, branch, and runtime session.

## Resolved decisions (loop-me / plan defaults)

Recorded so workflows do not re-litigate them:

- Runtime: any host that satisfies the advertised capabilities.
- Work-item creation and merge: human.
- No tracker status automation in v1.
- Orchestrator (if any) invokes existing commands; does not reimplement holdout, test gates, or mr-review phases.
- Epic workflow input: freeform / file / HLD / PRD to groom (same as `/groom`). Optional epic key is operator-provided context pasted or exported into that input — groom itself does not call the tracker.
- Historical only: an earlier three-stage orchestrator sequenced the stage files. Live behaviour is the conductor in `SKILL.md`, not that orchestrator.
- **Slice for max parallelism:** default is "all tickets in one parallel wave" when the codebase allows. Add blockers only when a true dependency exists. Inventing a foundation ticket "so there is a blocker" is wrong. Long linear chains are the anti-pattern when a fan-out would work.
- **Slice for small context:** each ticket must be understood, drafted, tested, implemented, verified, and reviewed within **~25% of one session context window**. If it has independent outcomes, unrelated code areas, more than three acceptance criteria, or needs continuation, split it. Prefer more atomic but vertically complete slices over one fat story or technical-layer microtickets.
- **Parallel execution:** when a wave has no remaining unmerged blockers, run each ticket as its own `/delivery <KEY>` (or ticket-to-mr) in a **separate worktree + session**. The conductor in one session does not multiplex execute; it briefs the wave and stops for the operator to fan out.

## Workflow index

| File | Loop |
|------|------|
| [`workflows/epic-to-backlog.md`](workflows/epic-to-backlog.md) | Idea/epic → groom → human creates work items |
| [`workflows/ticket-to-mr.md`](workflows/ticket-to-mr.md) | Work-item key → draft → spec checkpoint → execute → ready MR |
| [`workflows/mr-review-to-ready.md`](workflows/mr-review-to-ready.md) | MR iid → pack max correctness pass → mr-review → optional address-comments → human merge-ready |
| [`workflows/delivery-orchestrator.md`](workflows/delivery-orchestrator.md) | Historical pointer only; not live |

## Build-phase backlog (after these specs)

Implement against the live sources named in `SKILL.md`; do not invent new stage behavior.

1. **Conductor skill** — **done:** `/delivery` installed into an explicit skills directory.
   New chat after install so skills reload.
2. **Optional slice-to-key map** — persist slice→key map from epic-to-backlog if chat handoff proves lossy.
3. **Session checklist** — **done:** cheat-sheet lives inside `/delivery`
   (Phase command list + workflow path table).
4. **Tracker provider writes (opt-in later)**
   - After groom approval: create one work item per draft + parent/epic + blocked-by links, then return a `slice → KEY` map (keeps human checkpoint; removes copy-paste)
   - Optional read of epic key as groom input (still no writes inside groom itself)
5. **Forge provider metadata**
   - Change meta/discussions/notes only through `scripts/forge-provider.ts`
6. **Still deferred**
   - Tracker status transitions from the factory (humans own status unless policy changes)
   - Auto-spawn worktrees / cloud agents from the conductor (brief-only fan-out remains)
   - Replacing the max correctness pass with a lightweight built-in review
   - Auto-merge or auto `/openspec-archive`
