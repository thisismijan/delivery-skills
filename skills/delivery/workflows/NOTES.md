# NOTES — delivery world

> Historical and non-actionable. Terminology only; this file cannot override
> `../SKILL.md` (the conductor), `auto.md` (the next-step table), or the
> current stage specs.

Raw notes on tools, channels, and canonical terms for the delivery workflows
under `workflows/`. Sharpen here when a term drifts; workflows reference these
names, they do not redefine them.

## Hosts

| Host | Role |
|------|------|
| **Claude Code** | Same delivery pack: factory skills, native `/code-review max` when present, `/mr-review`. |
| **Cursor** | Same delivery pack: factory skills, `/code-review-max`, `/mr-review`, Cloud Agent fan-out. |

Claude Code's dynamic workflow runtime
([documentation](https://code.claude.com/docs/en/workflows)) is optional. It can
codify a large read-only fan-out, structured outputs, and adversarial
cross-checking. Cursor Cloud does not expose that runtime, so delivery uses the
same architecture through bounded native subagents and durable artifacts.
Neither host may put both sides of a human approval gate in one background run.

## Channels and trackers

| Channel | How we touch it | Writes allowed |
|---------|-----------------|----------------|
| **Jira (Cursor)** | Atlassian MCP `plugin-atlassian-atlassian`. Informational only, not a capability-check result. Tools include `getJiraIssue`, `searchJiraIssuesUsingJql`, `createJiraIssue`, `editJiraIssue`, `addOrEditJiraIssueComment`, `transitionJiraIssue`, graph link helpers. | Capability exists. Delivery policy still defaults to human create/transition unless a workflow explicitly opts in (see backlog). |
| **Jira (Claude)** | Atlassian MCP in the Claude session. | Factory: read + **comment only**. |
| **GitLab (Cursor MCP)** | `plugin-gitlab-GitLab` — auth attempted; live discovery currently fails with `403 Forbidden - MCP server not enabled for any of your groups`. Enable the GitLab MCP feature for the relevant GitLab group(s), then reconnect. | Until fixed: do not rely on this MCP. |
| **GitLab (CLI)** | `glab` (factory MR create/note/ready); `gl-mr` (read-only); `gl-note` (publish review notes) | Factory opens the merge request and posts notes. Humans merge and close. Stage 3 marks an MR ready after both review passes. `gl-mr` is GET-only by design. |
| **OpenSpec** | `openspec/` in the **target repo**; `/opsx:*` commands | Factory authors changes under `openspec/changes/`. Humans run `/openspec-archive` after merge. |

Token for `gl-mr` / `gl-note`: `~/token` (or `GL_TOKEN_FILE`). Project inferred from `git remote get-url origin` unless `GL_PROJECT` / `GL_HOST` set.

## Canonical command names

Do not confuse these review surfaces:

| Term | What it is | When |
|------|------------|------|
| **`/code-review-max !<iid>`** | Cursor skill in the personal skill store. Pinned, multi-lens correctness pass for a GitLab MR. Ends with an iid + head-SHA marker. | After a ready MR exists, before `/mr-review` in the same Cursor conversation. |
| **`/code-review max !<iid>`** | Claude Code's native equivalent. | After a ready MR exists, before `/mr-review` in the same Claude conversation. |
| **`/mr-review <iid>`** | Personal skill in both runtimes. Approach pass; validates the correctness pass against the current head, merges both passes, drafts under `.review/mr-<iid>/<head-sha>/`, and posts via `gl-note` only after human confirm. | Same conversation or a fresh one using the matching pinned max artifact. |
| **Cursor `/code-review`** | Lightweight built-in review command. | **Not** the max pass `/mr-review` depends on; it has no fan-out or freshness marker. |

Factory stages (this clone's `skills/` + `factory/`, both hosts):

| Command | Input | Stops when |
|---------|-------|------------|
| `/groom [file\|text]` | Idea / HLD / PRD | Drafts under `.ig-spec/grooming/<slug>/`; **no** Jira, **no** git |
| `/draft <JIRA-KEY>` | Jira key | Spec linked on branch + Jira comment (`SPEC_LINKED`), or terminal clarify/reject/escalate |
| `/execute <JIRA-KEY>` | Jira key (invocation = approval to build) | Ready MR after holdout approve, or escalate (no MR / no merge) |
| `/address-comments <JIRA-KEY>` | Jira key with existing open MR | Comments actioned + cumulative holdout; never merges |
| `/openspec-archive <change>` | Change name | Human-only, post-merge |
| `/delivery improve <KEY\|all>` | Accepted delivery lessons | Builds and evaluates an isolated candidate; never installs it |
| `/delivery improve apply <candidate>` | Exact evaluated candidate | Operator approval to snapshot and install that candidate |
| `/delivery improve rollback <version>` | Exact rollback version | Operator approval to snapshot current state and restore that version |

## Paths that matter

| Path | Meaning |
|------|---------|
| Target repo cwd | Where Claude Code is opened; holds `openspec/`, app code, `.ig-spec/grooming/` |
| `.ig-spec/grooming/<slug>/` | Groom outputs (ticket drafts, optional `prd.md`); gitignored |
| `openspec/changes/<key>-…/` | OpenSpec change for one ticket |
| `.review/mr-<iid>/<head-sha>/` | Pinned review brief, max pass, and draft notes |
| `delivery-skills` clone | Canonical skill pack; `./install.sh` links it into both hosts |
| `<delivery-skill>/candidates/` | Immutable proposed self-improvements, patches, and scorecards |
| `<delivery-skill>/versions/` | Immutable rollback snapshots taken before install or rollback |

## Human gates (today, by design)

1. Approve groom slice breakdown (before any draft files).
2. Create Jira tickets from groom drafts (copy manually; set epic/parent links yourself).
3. Review OpenSpec on the draft branch before invoking execute.
4. Confirm `/mr-review` publish (post all / summary only / nothing).
5. Merge the MR.
6. `/openspec-archive` after merge.
7. Install or rollback a delivery-skill candidate. Retro acceptance and a green
   scorecard do not satisfy this gate.

## Factory non-goals (v1)

- No `glab mr merge` / `glab mr close`
- No Jira status transitions
- No automatic Jira issue create from groom
- No Cursor-native port of ig-spec

## Vocabulary

- **Target repo** — the product codebase under change, not the ig-spec plugin repo.
- **Slice** — one groom vertical slice = one useful outcome = one user story = one future Jira ticket = one OpenSpec change, with one primary contract and one to three acceptance criteria.
- **Brief** — checkpoint payload: decision-ready summary + links to artifacts; never the raw draft dump.
- **Push right** — do maximal prep before the human checkpoint; ask once, late.
- **Holdout** — Opus reviewer in execute / address-comments; sees outcome only, not implementer reasoning.
- **Draft MR** — execute's reviewed handoff; Stage 3 marks it ready only after both review passes.
- **Terminal stop** — draft/execute/address-comments end the run (clarify/reject/escalate); human re-invokes in a **new** session after fixing the input. No polling.
- **Blocker** — a slice that must merge before another can start; only when the dependency is real (shared seam, schema, contract). Not required on every epic.
- **Parallel wave** — a set of slices that do not block each other and can run concurrently in separate git worktrees. May be the entire epic (no blockers). If they depend on blockers, the wave starts only after those are merged.
- **Worktree** — a `git worktree` checkout (often named like `wt-<key>`) used so each parallel ticket has its own cwd, branch, and Claude session.

## Resolved decisions (loop-me / plan defaults)

Recorded so workflows do not re-litigate them:

- Runtime hosts: Cursor and Claude Code.
- Jira story creation and merge: human.
- No Jira status automation in v1.
- Orchestrator (if any) invokes existing commands; does not reimplement holdout, test gates, or mr-review phases.
- Epic workflow input: freeform / file / HLD / PRD to groom (same as `/groom`). Optional Jira epic key is operator-provided context pasted or exported into that input — groom itself does not call Jira.
- Historical only: an earlier three-stage orchestrator sequenced the stage files. Live behaviour is the conductor in `SKILL.md`, not that orchestrator.
- **Slice for max parallelism:** default is "all tickets in one parallel wave" when the codebase allows. Add blockers only when a true dependency exists. Inventing a foundation ticket "so there is a blocker" is wrong. Long linear chains are the anti-pattern when a fan-out would work.
- **Slice for small context:** each ticket must be understood, drafted, tested, implemented, verified, and reviewed within **~25% of one session context window**. If it has independent outcomes, unrelated code areas, more than three acceptance criteria, or needs continuation, split it. Prefer more atomic but vertically complete slices over one fat story or technical-layer microtickets.
- **Parallel execution:** when a wave has no remaining unmerged blockers, run each ticket as its own `/delivery <KEY>` (or ticket-to-mr) in a **separate worktree + session**. The conductor in one session does not multiplex execute; it briefs the wave and stops for the operator to fan out.

## Workflow index

| File | Loop |
|------|------|
| [`workflows/epic-to-backlog.md`](workflows/epic-to-backlog.md) | Idea/epic → groom → human creates Jira stories |
| [`workflows/ticket-to-mr.md`](workflows/ticket-to-mr.md) | Jira key → draft → spec checkpoint → execute → ready MR |
| [`workflows/mr-review-to-ready.md`](workflows/mr-review-to-ready.md) | MR iid → host's max correctness pass → mr-review → optional address-comments → human merge-ready |
| [`workflows/delivery-orchestrator.md`](workflows/delivery-orchestrator.md) | Historical pointer only; not live |

## Build-phase backlog (after these specs)

Implement against the live sources named in `SKILL.md`; do not invent new stage behavior.

1. **Conductor skill** — **done:** `/delivery` installed in:
   - Claude Code: `~/.claude/skills/delivery/SKILL.md`
   - Cursor personal: `~/.cursor/skills/delivery/SKILL.md` + Agent Store
   - Cursor **project** (opened folder must contain the skill):
     - `code/.cursor/skills/delivery/` (workspace root)
     - `modernisation-dark-factory/.cursor/skills/delivery/`
     - `code/.agents/skills/delivery/`
   If you open a different repo as the Cursor project root, copy or symlink
   `.cursor/skills/delivery/` into that root (or rely on personal/Agent Store).
   New chat after install so skills reload.
2. **Optional `.ig-spec/grooming/<slug>/jira-keys.md`** — persist slice→key map
   from epic-to-backlog if chat handoff proves lossy.
3. **Session checklist** — **done:** cheat-sheet lives inside `/delivery`
   (Phase command list + workflow path table).
4. **Unblocked by Cursor Atlassian MCP (opt-in later)**
   - After groom approval: `createJiraIssue` per draft + parent/epic + blocked-by links, then return `slice → JIRA-KEY` map (keeps human checkpoint; removes copy-paste)
   - Optional read of epic key via `getJiraIssue` as groom input (still no writes inside ig-spec:groom itself)
5. **Blocked on GitLab MCP group enablement**
   - Fix: GitLab Admin/Group → enable MCP server for your groups → reconnect Cursor GitLab MCP (current error: not enabled for any groups)
   - Then: MR meta/discussions/notes via MCP as an alternative path beside `gl-mr` / `gl-note` / `glab`
6. **Still deferred**
   - Jira status transitions from the factory (humans own status unless policy changes)
   - Cursor-native port of ig-spec
   - Auto-spawn worktrees / Cloud Agents from the conductor (brief-only fan-out remains)
   - ig-spec N7 quality agents
   - Replacing the max correctness pass with Cursor's lightweight `/code-review`
   - Auto-merge or auto `/openspec-archive`
