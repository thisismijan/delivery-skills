# Reference

## Installer

```text
./install.sh --skills-dir <path> [--adapter <name>] [--provider <name>]...
./install.sh --help
```

Environment:

| Variable | Role |
|----------|------|
| `DELIVERY_ADAPTERS_DIR` | Override `adapters/` |
| `DELIVERY_PROVIDERS_DIR` | Override `providers/` |
| `DELIVERY_BIN_DIR` | Where provider tools are installed (`~/.local/bin`) |
| `DELIVERY_INSTALL_SKIP_BUN` | Skip `bun install` (tests) |
| `DELIVERY_FACTORY_ROOT` | Installed `_factory` for doctor and gates |
| `DELIVERY_SKILLS_DIR` | Installed skills directory |
| `CURSOR_SKILLS_DIR` | Cursor wrapper destination |
| `CURSOR_AGENT_STORE` | Cloud store install destination |
| `CLAUDE_SKILLS_DIR` | Claude wrapper destination |
| `CLAUDE_SETTINGS_FILE` | Claude settings for the mutation hook and agent-summary preload |
| `CURSOR_HOOKS_FILE` | Cursor `hooks.json` for the mutation hook |
| `MAX_FIX_ATTEMPTS` | Bounded repair attempts (`scripts/config.ts`, default 2) |
| `MAX_PARALLEL_WORKTREES` | Concurrent isolated auto worktrees (`scripts/config.ts`, default 4) |
| `WORKER_IDLE_MINUTES` | Minutes without a journal write before auto stops a parallel worker as idle (`scripts/config.ts`, default 20) |
| `ROUTING_PROFILING` | Diagnostic shadow-routing evidence. Defaults to `off`. Set `always` to collect evaluation evidence. Does not change live model selection, holdout review of new or changed code, or quality gates |

## Cost-control scripts

```text
bun "$FACTORY_ROOT/scripts/config.ts"
bun "$FACTORY_ROOT/scripts/review-fanout.ts" <input.json>
bun "$FACTORY_ROOT/scripts/review-fanout.ts" readiness <input.json>
bun "$FACTORY_ROOT/scripts/diff-scan.ts" <base> <head>
bun "$FACTORY_ROOT/scripts/forge-comments.ts" scope <comments.json> <head-files.json>
bun "$FACTORY_ROOT/scripts/forge-comments.ts" apply-suggestion <comment.json> <repo-root>
bun "$FACTORY_ROOT/scripts/ticket-structure.ts" <work-item.json>
bun "$FACTORY_ROOT/scripts/ticket-feasibility.ts" <work-item.json>
bun "$FACTORY_ROOT/scripts/apply-mechanical-edit.ts" <input.json> <repo-root>
bun "$FACTORY_ROOT/scripts/generate-tasks.ts" <change-dir>
bun "$FACTORY_ROOT/scripts/record-skip.ts" persist <routing-root> <run-id> <skips.json>
bun "$FACTORY_ROOT/scripts/routing-scorecard.ts" <routing-root> <run-id>
bun "$FACTORY_ROOT/scripts/review-packet.ts" --ticket <file> --spec <change-dir> [--diff <file>] [--evidence <file>]... --out <file>
```

`config.ts` prints the validated knobs, including `maxParallelWorktrees` and
`routingProfiling`. Unknown `ROUTING_PROFILING` values fail closed.

`review-fanout.ts` decides which `/code-review-max` lenses to start from
measured file and line counts, reversibility, classification completeness, and
surfaces. A measured diff with no reviewable code returns no lenses. A proven small reversible change, or a contained one (reversible, at
most 6 files and fewer than 400 lines, no sensitive surface or dependency
change), returns the two essential lenses; every other input, including
incomplete classification, returns all four. The returned `lenses` array is
authoritative. `review-fanout.ts measure <base> <head>` produces the counts
from code paths only. `review-fanout.ts adjudication <candidates.json>`
returns `none` when no lens raised a candidate, `standard` when every
candidate is Low, and `main` when any is Medium or above.

Release-readiness lens subagents resolve the same `standard` capability and
pass that exact identifier. `review-fanout.ts readiness` skips those
subagents on an empty or proven small reversible measured diff. The main
conversation still decides GO or NO-GO. Fast-tier models do not run those
lenses.

`diff-scan.ts` marks sensitive surfaces, one-way signals, and lowered quality
bars in a `base...head` diff from paths and changed lines, for TypeScript,
Python, and Java. Its marks are a floor for review and release readiness:
they can be added to, never removed. `--diff <file>` scans a saved diff.

`forge-comments.ts scope` records resolved, empty, acknowledgement-only,
mention-only, URL-only, and emoji-only notes, and already-applied
suggestions, as outdated. `apply-suggestion` replaces the named span of a
whole-body suggestion fence, including a `:-N+M` range, or writes nothing
and reports `model`.

`generate-tasks.ts` writes `tasks.md` from delta spec scenarios. A spec
without scenarios fails closed.

`record-skip.ts` stores each scripted skipped worker under the run id. The
scorecard counts those skips beside measured usage and never estimates
tokens saved. Skip recording does not depend on `ROUTING_PROFILING`.

`ticket-structure.ts` and `ticket-feasibility.ts` skip the draft assessor and
analyst when the ticket is complete, blocked, oversized, or names
authentication, authorization, secrets, credentials, OAuth, OIDC, JWT, or a
data, schema, or database migration.

`apply-mechanical-edit.ts` applies a proven TypeScript, JavaScript, Python, Java,
Go, C#, or Kotlin rename, import-only, or format-only unit without a model. Rename
covers a unique Python parameter or local and a unique Java field, and it
moves `From.java` when a unique type matches the listed file name.
Import-only also adds a unique TypeScript, Python, Java, Go, C#, or Kotlin
missing import. Format-only uses
`node_modules/.bin/prettier`, `.venv/bin/ruff` or `venv/bin/ruff`, or
`bin/google-java-format`, `bin/csharpier`, `bin/ktfmt`, or `bin/rustfmt` when that binary is
inside the repository and names and literals stay identical. A missing binary
keeps a built-in formatter where one exists; C#, Kotlin, and Rust stay on the worker
without their wrappers. Go uses its standard-library parser and formatter
helper. Rust is format-only; rename and import-only remain on the worker.
Overloads, attributes, `exec`/`eval`, `serialVersionUID`, extract method, and
a formatter that changes names keep the worker.

`review-packet.ts` writes one Markdown packet holding the work item, every
spec file under the change directory, the diff when given, and the last 6000
characters of each evidence file. Without `--diff` it builds the test writer's
packet; an empty diff file fails, because a review needs the complete diff.

## Runtime capabilities

`runtime-manifest.json`: `process.run`, `agent.dispatch`, `model.inventory`,
`forge.change`, `tracker.item`, `review.publish`, `mutation.guard`.

## Forge command

```text
bun "$FACTORY_ROOT/scripts/forge-provider.ts" <operation> <repoRoot> \
  "$FACTORY_ROOT/runtime-manifest.json" [input.json]
```

Operations: `find`, `read`, `pipeline`, `files`, `diff`, `commits`, `discussions`,
`anchors`, `approvals`, `create`, `set-draft`, `note`, `reply`, `land`. Also `plan` and `normalize`
for session-tool transport. `land` is adapter-only: `plan` refuses it when no
executable adapter is advertised, and `normalize` never accepts it.

`approvals` takes `{ "ref": "<change>" }` and returns who approved the change
and whether every approval rule is met, at the head it read. `land` takes
`ref`, `headRevision`, `kind` (`change` or `archive`), `ticketKey`,
`ledgerPath`, `runContractPath`, `readNoteIds` (the comment ids readiness saw),
and `approved: true`. It returns `decision` `landed`, `wait`, or `stop` with
plain reasons, and exits 0, 3, or 1 to match.

`pipeline` takes `{ "revision": "<sha>" }` and returns evidence bound to that
exact revision. Delivery uses normalized pipeline evidence from `read` for the
open change head, then calls `pipeline` for `revisions.merged` after merge.
Evidence for a branch's latest commit or a different revision is not accepted.

## Pipeline route

```text
bun "$FACTORY_ROOT/scripts/pipeline-route.ts" '<input-json>'
```

The input identifies the change or default-branch phase, exact-revision
pipeline evidence, failure attribution, current fix attempt, maximum attempts,
and whether the repair remains inside the approved scope. The result is one of:

| Action | Meaning |
|--------|---------|
| `proceed` | The exact revision passed |
| `wait` | Evidence is not terminal or is not available yet; subscribe or resume later |
| `fix-forward` | The failure is attributable, in scope, and within budget |
| `escalate` | A human decision or provider action is required |

For an open change, fix-forward updates the existing branch and invalidates
affected gates. For a merged revision, it creates a new reviewed recovery
change. It never retries provider jobs, reverts, or writes to the default
branch.

## Session tools

`/delivery doctor` writes `.delivery/runtime/mcp-inventory.json` from the host
tools visible in the current session. `mcp-route.ts` maps those tools onto the
portable forge and work-item operations. Authenticated session tools do not
need the matching CLI binary or env token for the operations they cover.

Never call a host tool that merges, closes, approves, deletes, resolves a
thread, or transitions work-item status.

## Work-item command

```text
bun "$FACTORY_ROOT/scripts/work-item-provider.ts" \
  <list|read|create|link|note|statuses|transition> <repoRoot> \
  "$FACTORY_ROOT/runtime-manifest.json" [input.json]
```

## Board status

```text
bun "$FACTORY_ROOT/scripts/board-status.ts" propose <repoRoot> "$FACTORY_ROOT/runtime-manifest.json" <work-item-key>
bun "$FACTORY_ROOT/scripts/board-status.ts" confirm <repoRoot> <board-map.json>
bun "$FACTORY_ROOT/scripts/board-status.ts" sync <repoRoot> "$FACTORY_ROOT/runtime-manifest.json" <work-item-key> <ready|in-progress|in-review|done>
```

`/delivery init` proposes a map from the board's columns to the four
delivery phases and confirms it with the operator. Draft syncs `ready`,
execute syncs `in-progress` and then `in-review`, and post-merge verify
syncs `done` after a verified deploy. A sync only moves a ticket forward, to
a column the confirmed map names. It skips, and the stage continues, when
there is no map, the board changed, or the ticket is already there or
further along. Closing, reopening, and backwards moves stay with people.

## Worker worktree files

```text
bun "$FACTORY_ROOT/scripts/worktree-files.ts" propose <repoRoot>
bun "$FACTORY_ROOT/scripts/worktree-files.ts" confirm <repoRoot> <worktree-files.json>
bun "$FACTORY_ROOT/scripts/worktree-files.ts" copy <repoRoot> <worktree-path>
bun "$FACTORY_ROOT/scripts/worktree-close.ts" <worktree-path> [--dry-run]
bun "$FACTORY_ROOT/scripts/worker-watch.ts" <workers-dir> <dispatch.json>
```

`/delivery init` proposes the local files git ignores (for example `.env`)
and saves only the exact paths the operator confirms. Each must be a regular
file inside the repository that git ignores and does not track, no larger than
1 MiB, and not a symbolic link. When auto creates a worker's worktree, `copy`
places those files in it, and stops that key without writing anything if one
is missing or already present. `worktree-close.ts` removes a worker's
worktree only when nothing is uncommitted or untracked and its last commit is
on a remote branch; otherwise it keeps the folder and says why.
`worker-watch.ts` reports each dispatched worker as active or idle from its
journal's last write and exits 3 when any is idle.

## Worker sandbox

```text
bun "$FACTORY_ROOT/scripts/sandbox-run.ts" confirm <repoRoot> <sandbox.json>
bun "$FACTORY_ROOT/scripts/sandbox-run.ts" check <repoRoot>
bun "$FACTORY_ROOT/scripts/sandbox-run.ts" run <repoRoot> <worktree-path> <state-root> <run-id> <KEY> [--dry-run]
bun "$FACTORY_ROOT/scripts/sandbox-run.ts" stop <repoRoot> <run-id> <KEY>
```

The sandbox is optional. `/delivery init` saves `.delivery/sandbox.json` only
when the operator approves it: `engine` (`docker` or `podman`), a local
`image`, `network` (`none` or `open`), `env` (variable names passed through
from the coordinator, at most 50), `setup` (up to 20 argument lists run inside
the container before the worker), `worker` (an argument list that names the
ticket with `{key}`), and `approval`. `check` exits 0 when the engine is on
PATH and the image is present, 3 when no sandbox was confirmed, and 1 when a
confirmed sandbox cannot run; auto stops the fan-out on 1 rather than running
workers unsandboxed.

`run` starts one container per worker, named `delivery-<run-id>-<key>`. It
mounts the worktree and its git data read-write, the state root read-only, the
run's journal folder read-write, and the pack read-only. It drops every Linux
capability, forbids privilege escalation, runs as the coordinator's user, and
turns networking off unless the config says `open`. The worker's commits stay
in its worktree; nothing else is copied back. The container is removed when
the worker ends, whatever its exit code. `--dry-run` prints the engine
commands instead. `stop` removes the container, which ends an idle worker's
processes. Limiting network access to listed hosts is not supported: a worker
that needs a model or forge API needs `open`.

## Provider credentials and overrides

| Provider | Credentials | Identity overrides |
|----------|-------------|--------------------|
| GitHub | `GITHUB_TOKEN`, `GH_TOKEN`, `GH_TOKEN_FILE`, `~/token` | `GH_HOST` / `GITHUB_HOST`, `GH_REPO` / `GITHUB_REPOSITORY` |
| GitLab | `GITLAB_TOKEN`, `GL_TOKEN_FILE`, `~/token` | `GL_HOST`, `GL_PROJECT` |
| Jira | `JIRA_SITE`, email+token or token file | Project key per repository: `delivery-init.ts --work-items jira --setting project=<KEY>`; MCP transport also records `--setting site=<url>` for `cloudId`. Board moves need `--setting board=<board-id>` |

## Artifacts (gitignored in the target repo)

| Path | Holds |
|------|-------|
| `.delivery/work-items.json` | Confirmed work-item provider and its per-repository settings |
| `.delivery/work-items/` | Local-files items |
| `.delivery/board-status.json` | Operator-confirmed map from board columns to delivery phases |
| `.delivery/worktree-files.json` | Operator-confirmed local files copied into each worker worktree |
| `.delivery/sandbox.json` | Operator-confirmed container settings for parallel workers |
| `.delivery/runs/` | Ledgers, run contracts, retros |
| `.delivery/workers/` | Parallel worker journals |
| `.delivery/routing/` | Model inventory and scorecards |
| `.delivery/candidates/`, `.delivery/versions/` | Skill improvement |
| `.review/` | Gates, diffs, verdicts, draft notes |

## Doctor

`bun "$FACTORY_ROOT/scripts/doctor.ts"` exits 0 when **read-only lifecycle**
checks pass. An unpinned Bun version and an unverified mutation hook do not
fail that exit. Full lifecycle is a separate verdict: pinned Bun plus a
verified denial hook. Optional provider and OpenSpec gaps do not fail
read-only readiness. Init reprints only unresolved checks after it writes
configuration.
