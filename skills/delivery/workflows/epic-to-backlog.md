# Workflow: epic-to-backlog

Turn an epic-sized idea into groomed, draft-ready work items. Compose `/groom`;
do not reimplement grooming. In continuous mode the conductor materializes the
approved items through the repository's confirmed work-item provider. A
single-step groom leaves the verified drafts for the operator.

Terms: see [`NOTES.md`](../NOTES.md).

## Loop

Recurring: a work-item group, HLD, PRD, or raw idea needs breaking into individually
deployable stories before any `/draft`.

## Trigger

**Event:** operator starts a runtime session in the **target repo** and
invokes this workflow with one of:

1. A file path to an idea / HLD / PRD (`.md` or `.txt`)
2. Inline text (pasted epic description, acceptance notes, constraints)
3. Conversation context already containing that material

If a work-item group is the starting point, read its summary and description
through the selected provider when available. Otherwise the operator may export
or paste them into (1) or (2). The `/groom` skill itself never calls the
provider; only the conductor may materialize approved items afterward.

If there is no usable input, stop and ask for a file path or description. Do
not guess.

## Preconditions

- the runtime or the runtime opened with cwd = **target repo**
- `/groom` available from this pack (`factory/RUNTIME.md` resolves)
- Target repo has been explored enough for groom (read-only); OpenSpec init is
  **not** required for groom (groom writes only under the grooming output directory)
- Bun available (groom path/verify scripts)

## Steps

### 1. Run groom (slice for parallel waves)

Invoke:

```
/groom <file-path | inline-text>
```

Follow the `/groom` skill. Non-negotiables this
workflow must not weaken:

- No MCP, git, or work-item provider from groom
- One grilling question per turn. A real choice follows `SKILL.md`'s
  **Human decision brief**: options and trade-offs first, then the withheld
  recommendation after they answer
- Factual and single-path questions stay direct
- Write no ticket draft or PRD before the operator explicitly approves the
  slice breakdown; `decisions.md` may be appended as choices settle
- Every final draft passes `verify-ticket.ts`

**Slicing preference (operator + groom grilling):** maximize independent
tickets. Execution still obeys auto's `maxParallelWorktrees` cap from
`MAX_PARALLEL_WORKTREES` (default 4). A first ticket that blocks the rest is
**one possible shape**, not the default.

Order of preference:

1. **All independent** — every slice blocked-by nothing (or only
   external/pre-existing work). Auto dispatches these ready tickets in capped
   batches, eventually using one worktree per ticket. Prefer this whenever the
   codebase allows.
2. **Blockers only when real** — if a shared seam/schema/contract truly must
   land first, add the smallest blocker set, then a parallel wave of everything
   that depends only on that set (and not on each other).
3. **Further waves** — only for remaining true dependencies; still prefer wide
   waves over a long linear chain.

**Small-context size (hard requirement):** each slice must be small enough that
one fresh session can understand, draft, test, implement, verify, and review it
using **at most ~25% of the session context window**. The remaining context is
recovery budget, not permission to enlarge the ticket. Each slice has one useful
vertical outcome, one primary public contract or behaviour, one cohesive code
area plus tests, and one to three acceptance criteria. Signals a slice is too
big:

- Touches many unrelated modules or a very large diff surface
- Multiple independently shippable acceptance criteria clusters
- Groom or operator expects any continuation session
- Spec/tasks read like a mini-epic

If too big: split into more vertical slices (still one user story each; thin
the story). Keep each slice useful and **vertically complete** when merged; do
not create frontend-only, backend-only, test-only, or speculative foundation
microtickets. Do not "save context" by skipping tests or collapsing stories.

When proposing or approving slices, challenge:

- Every blocked-by edge: "Must B wait on A, or can both start now in parallel
  worktrees?"
- Every slice's size: "Can the entire ticket finish in a quarter of a context window?"

Recommended defaults in groom grilling: assume parallel unless you can name a
concrete merge-order constraint; assume split unless you can defend session
fit. Do not invent a foundation ticket just to have a blocker.

Still one user story per ticket. Parallelism and session fit come from the
dependency graph and slice granularity, not from stuffing multiple stories
into one ticket.

### 2. Wait for groom completion

Groom ends with a closing summary: output directory
the directory printed by `groom-paths.ts`, list of draft files, optional `prd.md`.

If the operator abandons mid-grill or rejects the breakdown without approval,
stop. No drafts, no brief, no work items.

### 3. Materialize the approved work items

Present a **brief** only (not the full draft bodies in the chat dump):

- Output directory path
- **Wave view** of the graph, not only a flat list. Prefer the all-parallel
  shape when valid:

  ```
  Wave 0 (parallel): 1, 2, 3, 4, 5 — each blocked by: nothing
  ```

  Blocker example (only when needed):

  ```
  Wave 0 (blocker):  1 — blocked by: nothing
  Wave 1 (parallel): 2, 3, 4 — each blocked by: 1 only
  ```

- Numbered list under each wave: draft filename, title, blocked-by
- One-line reminder: each draft = one work item = later one `/draft`
  or `/delivery <KEY>`; each parallel-wave ticket gets **one worktree** when a
  `maxParallelWorktrees` slot is available (eligible immediately if blocked-by
  is empty; otherwise after blockers are merged);
  each ticket sized for **~25% of a session context window**
- Link/path to optional `prd.md` if present
- In continuous mode, use the confirmed provider to create exactly one work item
  from each approved, verified draft. Preserve the title and body, set the
  group/parent references when the provider supports them, and create only the
  "blocked by" links in the approved graph. Write one strict JSON input per
  slice with `approved: true`, its run-and-slice audit id, title, body, type,
  and approved blockers, then run:
  ```
  bun "${FACTORY_ROOT}/scripts/work-item-provider.ts" create \
    "$(git rev-parse --show-toplevel)" \
    "${FACTORY_ROOT}/runtime-manifest.json" <approved-item.json>
  ```
  After all references exist, apply each approved dependency set with the same
  command's `link` operation and an input containing `approved: true`, `ref`,
  and `blockedBy`. Never invoke a provider-specific API or invent an operation.
  Record `slice-number → WORK-ITEM-KEY` in the ledger.
  Creation is idempotent: use one exact audit marker containing the run id and slice number,
  reuse that exact item if it exists, and stop on conflicting or multiple matches.
  Never create an unapproved slice and never transition status.
- In explicit single-step groom mode, print the brief and ask the operator to
  create the work items or invoke `/delivery auto` with the approved grooming
  output to materialize them.
- After keys exist, freeze the approved plan with
  `scripts/sdlc-constitution.ts freeze <draft.json>` into
  `.delivery/runs/<id>.run-contract.json`. Later stages check that file.

Do not open MRs in this stage.

### 4. Done

Workflow is done when:

- Drafts exist under the directory printed by `groom-paths.ts` and passed verify
- Continuous mode has recorded every created or idempotently reused key; or the
  single-step operator has supplied keys or ended the run

If the operator will materialize work items later, record in the brief that
`ticket-to-mr` starts only once a key exists. Ending without keys is a valid
stop; do not poll the provider.

## Handoff

| Artifact | Consumer |
|----------|----------|
| `the directory printed by groom-paths.ts*.md` drafts | Conductor or human → work item bodies |
| Optional `prd.md` | Human / later context |
| `slice → WORK-ITEM-KEY` map (if provided) | [`ticket-to-mr`](ticket-to-mr.md) triggers |

Next workflow: [`ticket-to-mr`](ticket-to-mr.md) / [`delivery-orchestrator`](delivery-orchestrator.md)
per the dependency graph:

- If wave 0 has no blockers: dispatch it immediately in
  `maxParallelWorktrees`-sized batches.
- If some slices are blockers: finish those to **merge** first, then fan out
  everything they unblock.
- Never start a ticket whose blockers are not yet merged.

## Failure modes

| Condition | Action |
|-----------|--------|
| No input | Ask once; stop |
| Operator never approves slices | Stop; zero files written |
| Draft fails `verify-ticket.ts` and cannot be fixed in groom's loop | Stay inside groom's fail-closed fix loop; do not invent tickets |
| Selected provider cannot create or link items in continuous mode | Stop with the missing capability; keep every approved draft |

## Out of scope

- `/draft`, execute, MR, review
- work-item status transitions
- Scheduling / inbox polling for new epics

## Implementer notes

An implementer building automation for this workflow should:

1. Shell into target-repo the runtime with this delivery pack loaded, or document the
   exact operator slash-command sequence above.
2. Treat groom as a black box; wrap only trigger resolution + the post-groom
   brief + collection of the key map.
3. Persist the key map wherever the operator wants (chat reply is enough for
   v1; optional file under `the directory printed by groom-paths.tstracker-keys.md` only if a
   later build phase adds it — not required by this spec).
