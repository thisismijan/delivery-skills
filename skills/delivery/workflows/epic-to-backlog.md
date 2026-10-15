# Workflow: epic-to-backlog

Turn an epic-sized idea into groomed, draft-ready Jira stories the human creates
by hand. Compose `/groom`; do not reimplement grooming.

Terms: see [`NOTES.md`](../NOTES.md).

## Loop

Recurring: a Jira epic, HLD, PRD, or raw idea needs breaking into individually
deployable stories before any `/draft`.

## Trigger

**Event:** operator starts a Claude Code session in the **target repo** and
invokes this workflow with one of:

1. A file path to an idea / HLD / PRD (`.md` or `.txt`)
2. Inline text (pasted epic description, acceptance notes, constraints)
3. Conversation context already containing that material

If a Jira epic key is the starting point, the operator exports or pastes the
epic summary/description (and any child list they care about) into (1) or (2).
This workflow never calls Jira MCP.

If there is no usable input, stop and ask for a file path or description. Do
not guess.

## Preconditions

- Cursor or Claude Code opened with cwd = **target repo**
- `/groom` available from this pack (`factory/RUNTIME.md` resolves)
- Target repo has been explored enough for groom (read-only); OpenSpec init is
  **not** required for groom (groom writes only under `.ig-spec/grooming/`)
- Bun available (groom path/verify scripts)

## Steps

### 1. Run groom (slice for parallel waves)

Invoke:

```
/groom <file-path | inline-text>
```

Follow the `/groom` skill. Non-negotiables this
workflow must not weaken:

- No MCP, git, or Jira from groom
- One grilling question per turn, each with a recommended answer
- Write nothing before the operator explicitly approves the slice breakdown
- Every final draft passes `verify-ticket.ts`

**Slicing preference (operator + groom grilling):** maximize parallel worktrees.
A first ticket that blocks the rest is **one possible shape**, not the default.

Order of preference:

1. **All parallel** — every slice blocked-by nothing (or only external/pre-existing
   work). Operator fans out immediately: one worktree per ticket. Prefer this
   whenever the codebase allows.
2. **Blockers only when real** — if a shared seam/schema/contract truly must
   land first, add the smallest blocker set, then a parallel wave of everything
   that depends only on that set (and not on each other).
3. **Further waves** — only for remaining true dependencies; still prefer wide
   waves over a long linear chain.

**Session-fit size (hard preference):** each slice must be small enough that
one Claude session can carry it through the delivery path for that ticket
(typically `/draft` → spec checkpoint → `/execute` → ready MR)
using **at most ~50% of the session context window**. Budget the other half
for review, address-comments, or recovery. Signals a slice is too big:

- Touches many unrelated modules or a very large diff surface
- Multiple independently shippable acceptance criteria clusters
- Groom or operator expects execute will need a continuation session
- Spec/tasks read like a mini-epic

If too big: split into more vertical slices (still one user story each; thin
the story). Do not "save context" by skipping tests or collapsing stories.

When proposing or approving slices, challenge:

- Every blocked-by edge: "Must B wait on A, or can both start now in parallel
  worktrees?"
- Every slice's size: "Can draft+execute finish in ~half a context window?"

Recommended defaults in groom grilling: assume parallel unless you can name a
concrete merge-order constraint; assume split unless you can defend session
fit. Do not invent a foundation ticket just to have a blocker.

Still one user story per ticket. Parallelism and session fit come from the
dependency graph and slice granularity, not from stuffing multiple stories
into one ticket.

### 2. Wait for groom completion

Groom ends with a closing summary: output directory
`.ig-spec/grooming/<slug>/`, list of draft files, optional `prd.md`.

If the operator abandons mid-grill or rejects the breakdown without approval,
stop. No drafts, no brief, no Jira.

### 3. Checkpoint — create Jira stories (push right)

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
- One-line reminder: each draft = one Jira ticket = later one `/draft`
  or `/delivery <KEY>`; each parallel-wave ticket gets **one worktree** (start
  immediately if blocked-by is empty; otherwise after blockers are merged);
  each ticket sized for **~50% of a session context window**
- Link/path to optional `prd.md` if present
- Explicit ask: create the Jira tickets (copy draft content), set epic/parent
  links and Jira "blocked by" / link types to match the wave graph, then reply
  with the map `slice-number → JIRA-KEY` (or confirm done and paste keys)

Do not create Jira issues. Do not transition status. Do not open MRs.

### 4. Done

Workflow is done when:

- Drafts exist under `.ig-spec/grooming/<slug>/` and passed verify
- Operator has confirmed Jira tickets exist and supplied keys (or stated they
  will create them later and is ending the run)

If the operator will create tickets later, record in the brief that
`ticket-to-mr` starts only once a key exists. Ending without keys is a valid
stop; do not poll Jira.

## Handoff

| Artifact | Consumer |
|----------|----------|
| `.ig-spec/grooming/<slug>/*.md` drafts | Human → Jira ticket bodies |
| Optional `prd.md` | Human / later context |
| `slice → JIRA-KEY` map (if provided) | [`ticket-to-mr`](ticket-to-mr.md) triggers |

Next workflow: [`ticket-to-mr`](ticket-to-mr.md) / [`delivery-orchestrator`](delivery-orchestrator.md)
per the dependency graph:

- If wave 0 is all parallel (no blockers): fan out immediately.
- If some slices are blockers: finish those to **merge** first, then fan out
  everything they unblock.
- Never start a ticket whose blockers are not yet merged.

## Failure modes

| Condition | Action |
|-----------|--------|
| No input | Ask once; stop |
| Operator never approves slices | Stop; zero files written |
| Draft fails `verify-ticket.ts` and cannot be fixed in groom's loop | Stay inside groom's fail-closed fix loop; do not invent tickets |
| Operator wants auto-created Jira issues | Refuse; point to NOTES non-goals |

## Out of scope

- `/draft`, execute, MR, review
- Jira API create/link/transition
- Scheduling / inbox polling for new epics

## Implementer notes

An implementer building automation for this workflow should:

1. Shell into target-repo Claude Code with ig-spec loaded, or document the
   exact operator slash-command sequence above.
2. Treat groom as a black box; wrap only trigger resolution + the post-groom
   brief + collection of the key map.
3. Persist the key map wherever the operator wants (chat reply is enough for
   v1; optional file under `.ig-spec/grooming/<slug>/jira-keys.md` only if a
   later build phase adds it — not required by this spec).
