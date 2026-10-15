# Workflow: ticket-to-mr

Take one Jira ticket through OpenSpec draft, human spec approval, and execute
until a ready GitLab MR exists. Compose `/draft` and `/execute`;
do not reimplement assessors, gates, or holdout.

Terms: see [`NOTES.md`](../NOTES.md).

## Loop

Recurring: a draft-ready Jira story needs a reviewed, ready-to-merge MR without
the factory merging it.

## Trigger

**Event:** operator (or conductor) supplies a single Jira key `PROJ-123` in a
Cursor or Claude Code session with cwd = **target repo** and this pack installed.

One ticket per run (one cwd / worktree / Claude session). For an epic's
children, see [`epic-to-backlog`](epic-to-backlog.md) and
[`delivery-orchestrator`](delivery-orchestrator.md): every ready-now key gets
its own worktree run; true blockers merge before their dependents start. Do
not share one dirty worktree across parallel tickets.

## Preconditions

- Target repo has `openspec/` initialized (expanded profile) — required before
  draft can author a change
- Atlassian MCP authorized; `jira_base_url` configured on the plugin
- `glab` authenticated (`glab auth login`)
- Bun available for gate scripts
- Ticket body is expected to be draft-ready (from groom or equivalent); weak
  tickets are handled by draft's terminal clarify/reject, not by this workflow
  inventing requirements
- Ticket should fit **~50% of a session context** for draft+execute (see
  [`epic-to-backlog`](epic-to-backlog.md)). If mid-run it is clearly too large,
  stop and ask the operator to split the ticket rather than burning the full
  window and continuing blind.

## Steps

### 1. Draft

```
/draft <JIRA-KEY>
```

Outcomes (terminal for this step — do not poll):

| Outcome | Meaning | Next |
|---------|---------|------|
| Spec linked (`SPEC_LINKED`) | Change under `openspec/changes/<name>/`, committed on branch, Jira comment with link | Checkpoint 2 |
| clarify / reject | Jira comment posted with gaps | Stop. Human edits ticket; re-invoke draft in a **new** session |
| escalate (feasibility / malformed verdict) | Jira comment posted | Stop. Human changes scope; new session |

### 2. Checkpoint — approve the spec (push right)

Present a **brief**:

- Jira key + link
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
/execute <JIRA-KEY>
```

Factory behavior this workflow must not override:

- Tests first → red gate → implement → green (+ lint/types) → Opus holdout
- MR opened **only** on holdout `approve`, marked ready
- On changes-requested: bounded fix loop, still no MR until approve
- On reject / exhausted attempts: push branch, escalate, **no** MR
- Never merge, never Jira status transition

### 4. Done

Workflow is done when either:

- A ready MR exists for the change branch (record **MR iid** and URL), or
- Execute escalated / stopped with no MR (record reason from factory output)

## Handoff

| Artifact | Consumer |
|----------|----------|
| Ready MR iid + URL | [`mr-review-to-ready`](mr-review-to-ready.md) |
| Jira key | address-comments later if needed |
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
- Merge, archive, Jira status
- Multi-ticket batches inside one execute

## Implementer notes

1. Wrap draft → brief → execute; pass through all factory terminal stops.
2. Persist MR iid for the review workflow (chat is enough for v1).
3. Do not add a second holdout or a parallel test runner outside ig-spec.
