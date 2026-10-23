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
| `CLAUDE_SETTINGS_FILE` | Claude settings for the mutation hook |
| `CURSOR_HOOKS_FILE` | Cursor `hooks.json` for the mutation hook |
| `MAX_FIX_ATTEMPTS` | Bounded repair attempts (`scripts/config.ts`, default 2) |
| `MAX_PARALLEL_WORKTREES` | Concurrent isolated auto worktrees (`scripts/config.ts`, default 4) |
| `ROUTING_PROFILING` | Diagnostic shadow-routing evidence. Defaults to `off`. Set `always` to collect evaluation evidence. Does not change live model selection, holdout review of new or changed code, or quality gates |

## Cost-control scripts

```text
bun "$FACTORY_ROOT/scripts/config.ts"
bun "$FACTORY_ROOT/scripts/review-fanout.ts" <input.json>
```

`config.ts` prints the validated knobs, including `maxParallelWorktrees` and
`routingProfiling`. Unknown `ROUTING_PROFILING` values fail closed.

`review-fanout.ts` decides which `/code-review-max` lenses to start from
measured file and line counts, reversibility, classification completeness, and
surfaces. A proven small reversible change, or a contained one (reversible, at
most 6 files and fewer than 400 lines, no sensitive surface or dependency
change), returns the two essential lenses; every other input, including
incomplete classification, returns all four. The returned `lenses` array is
authoritative. `review-fanout.ts measure <base> <head>` produces the counts
from code paths only. `review-fanout.ts adjudication <candidates.json>`
returns `none` when no lens raised a candidate, `standard` when every
candidate is Low, and `main` when any is Medium or above.

## Runtime capabilities

`runtime-manifest.json`: `process.run`, `agent.dispatch`, `model.inventory`,
`forge.change`, `tracker.item`, `review.publish`, `mutation.guard`.

## Forge command

```text
bun "$FACTORY_ROOT/scripts/forge-provider.ts" <operation> <repoRoot> \
  "$FACTORY_ROOT/runtime-manifest.json" [input.json]
```

Operations: `find`, `read`, `pipeline`, `files`, `diff`, `commits`, `discussions`,
`anchors`, `create`, `set-draft`, `note`, `reply`. Also `plan` and `normalize`
for session-tool transport.

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
  <list|read|create|link|note> <repoRoot> \
  "$FACTORY_ROOT/runtime-manifest.json" [input.json]
```

## Provider credentials and overrides

| Provider | Credentials | Identity overrides |
|----------|-------------|--------------------|
| GitHub | `GITHUB_TOKEN`, `GH_TOKEN`, `GH_TOKEN_FILE`, `~/token` | `GH_HOST` / `GITHUB_HOST`, `GH_REPO` / `GITHUB_REPOSITORY` |
| GitLab | `GITLAB_TOKEN`, `GL_TOKEN_FILE`, `~/token` | `GL_HOST`, `GL_PROJECT` |
| Jira | `JIRA_SITE`, email+token or token file | Project key per repository: `delivery-init.ts --work-items jira --setting project=<KEY>`; MCP transport also records `--setting site=<url>` for `cloudId` |

## Artifacts (gitignored in the target repo)

| Path | Holds |
|------|-------|
| `.delivery/work-items.json` | Confirmed work-item provider and its per-repository settings |
| `.delivery/work-items/` | Local-files items |
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
