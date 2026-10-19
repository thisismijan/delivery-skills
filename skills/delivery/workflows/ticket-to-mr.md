# Workflow: ticket-to-mr

Take one work item through OpenSpec draft, human spec approval, and execute
until a ready merge request exists. Compose `/draft` and `/execute`;
do not reimplement assessors, gates, or holdout.

Terms: see [`NOTES.md`](../NOTES.md).

## Loop

Recurring: a draft-ready the tracker story needs a reviewed, ready-to-merge MR without
the factory merging it.

## Trigger

**Event:** operator (or conductor) supplies a single work-item key `PROJ-123` in a
the runtime or the runtime session with cwd = **target repo** and this pack installed.

One ticket per run (one cwd / worktree / the runtime session). For an epic's
children, see [`epic-to-backlog`](epic-to-backlog.md) and
[`delivery-orchestrator`](delivery-orchestrator.md): every ready-now key gets
its own worktree run; true blockers merge before their dependents start. Do
not share one dirty worktree across parallel tickets.

## Preconditions

- Target repo has `openspec/` initialized (expanded profile) — required before
  draft can author a change
- tracker provider authorized; `tracker_base_url` configured on the plugin
- `scripts/forge-provider.ts` can `read` against the runtime manifest
- Bun available for gate scripts
- Ticket body is expected to be draft-ready (from groom or equivalent); weak
  tickets are handled by draft's terminal clarify/reject, not by this workflow
  inventing requirements
- Ticket must fit **~25% of a session context** for understanding, draft,
  tests, implementation, verification, and review (see
  [`epic-to-backlog`](epic-to-backlog.md)). Draft's assessor fails closed with
  `SPLIT_REQUIRED` when it contains more than one independently useful outcome.
  If scope growth appears mid-run, stop and ask the operator to split the
  ticket rather than consuming the recovery budget.

## Steps

### 1. Draft

```
/draft <WORK-ITEM-KEY>
```

Outcomes (terminal for this step — do not poll):

| Outcome | Meaning | Next |
|---------|---------|------|
| Spec linked (`SPEC_LINKED`) | Change under `openspec/changes/<name>/`, committed on branch, tracker comment with link | Checkpoint 2 |
| split required | Ticket exceeds the small-context atomicity contract; tracker comment proposes vertical tickets | Stop. Human creates the smaller tickets; run draft once per key |
| clarify / reject | tracker comment posted with gaps | Stop. Human edits ticket; re-invoke draft in a **new** session |
| escalate (feasibility / malformed verdict) | tracker comment posted | Stop. Human changes scope; new session |

### 2. Checkpoint — approve the spec (push right)

Present a **brief**:

- work-item key + link
- Change name / branch name
- Paths: `proposal.md`, `tasks.md`, `specs/` under the change dir
- One-line what the change claims to do (from proposal, not a paste of the whole file)
- Ask: approve for build, request edits (ticket or spec), or abandon

Rules:

- Invoking `/execute` **is** the approval to build. Do not call execute
  until the operator explicitly approves (or themselves runs execute).
- If they want edits: stop. They edit ticket and/or spec and re-run
  `/draft` (idempotent replace) in a new session, then return here.
- Do not start implementation during this checkpoint.

### 3. Execute

On explicit approval:

```
/execute <WORK-ITEM-KEY>
```

Factory behavior this workflow must not override:

- Tests first → red gate → implement → green (+ lint/types) → Opus holdout
- Draft MR opened **only** on holdout `approve`; Stage 3 marks it ready
- On changes-requested: bounded fix loop, still no MR until approve
- On reject / exhausted attempts: push branch, escalate, **no** MR
- Never merge, never tracker status transition

### 4. Done

Workflow is done when either:

- A draft MR exists for the change branch (record **MR iid** and URL), or
- Execute escalated / stopped with no MR (record reason from factory output)

## Handoff

| Artifact | Consumer |
|----------|----------|
| Draft MR iid + URL | [`mr-review-to-ready`](mr-review-to-ready.md) |
| work-item key | address-comments later if needed |
| Change name / branch | `/openspec-archive` after human merge (outside this workflow) |

## Failure modes

| Condition | Action |
|-----------|--------|
| `find-change` / `verify-change` fail | Factory escalates; stop; no MR |
| Red gate fails (tests pass vacuously) | Factory escalates; stop |
| Green gate fails after exhausted fixes | Factory escalates; stop |
| Holdout not approve | No MR (or no ready blessing); stop with factory reason |
| Operator runs execute without reading the brief | Allowed if they choose; brief is the recommended path, not a hard lock in today's factory |

## Out of scope

- Groom / epic breakdown
- The host's max correctness pass, `/mr-review`, `/address-comments`
- Merge, archive, tracker status
- Multi-ticket batches inside one execute

## Implementer notes

1. Wrap draft → brief → execute; pass through all factory terminal stops.
2. Persist MR iid and head-keyed review artifact links in the ledger.
3. Do not add a second holdout. Green, lint, and typecheck may run in parallel.
