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

## Runtime capabilities

`runtime-manifest.json`: `process.run`, `agent.dispatch`, `model.inventory`,
`forge.change`, `tracker.item`, `review.publish`, `mutation.guard`.

## Forge command

```text
bun "$FACTORY_ROOT/scripts/forge-provider.ts" <operation> <repoRoot> \
  "$FACTORY_ROOT/runtime-manifest.json" [input.json]
```

Operations: `find`, `read`, `files`, `diff`, `commits`, `discussions`,
`anchors`, `create`, `set-draft`, `note`, `reply`.

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
| Jira | `JIRA_SITE`, email+token or token file | Project key per repository: `delivery-init.ts --work-items jira --setting project=<KEY>` (optional `--setting site=<url>`) |

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
