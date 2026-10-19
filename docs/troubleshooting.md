# Troubleshooting

Run doctor from the target repository:

```bash
bun "$FACTORY_ROOT/scripts/doctor.ts"
```

## Bun missing or wrong version

The installer warns and continues if Bun is skipped. Gates then fail. Install
Bun `1.4.2` and rerun `bun install --frozen-lockfile` in `factory/` or
reinstall the pack without `DELIVERY_INSTALL_SKIP_BUN`.

## Tools installed but doctor says missing

Provider binaries land in `${DELIVERY_BIN_DIR:-$HOME/.local/bin}`. Add that
directory to `PATH` in the same shell the host uses for subprocesses.

## Cursor mutating stages blocked

Expected. Cursor has no verified denial hook. Read-only stages still run.
Install the Claude Code adapter when you need execute, draft, or other
mutating stages.

## GitHub install still looked like GitLab

Older doctor always probed GitLab tools. Current doctor follows the runtime
manifest. Reinstall, then confirm the report names `github-forge` rather than
`gitlab-forge`. Wrappers still default to GitLab unless you pass
`--provider github`.

## Init exits 1

`delivery-init.ts` without `--work-items` lists providers and exits until you
confirm one. Pass `--work-items local-files` (or `github` / `gitlab` / `jira`).

## Saved remote provider unavailable

Delivery does not fall back to local files. Reinstall the provider, restore
credentials, or `delivery-init.ts --work-items <id> --replace` after an
explicit choice. Selection does not migrate existing items.

## `~/token` used by two forges

GitHub and GitLab both fall back to `~/token`. Prefer `GITHUB_TOKEN` /
`GITLAB_TOKEN` or dedicated `GH_TOKEN_FILE` / `GL_TOKEN_FILE` so the files
cannot collide.

## Truncated GitHub diffs

The GitHub adapter refuses incomplete file or diff views instead of reviewing
a partial patch. Increase GitHub's ability to return the full patch, or split
the change.

## OpenSpec archive fails

Install the OpenSpec CLI on PATH, or `--provider openspec` and rerun setup.
Archive only after a human merge. The bundled archive skill must not fold
specs during execute.

## Combining two forge providers

Last overlay wins. A second forge provider replaces the first for
`forge.change` and `review.publish`. Mix forge + Jira instead of two forges.

## Secret printed in a log

Doctor, installer, and adapters must never print token values. If you see
one, treat it as a bug: rotate the credential and open a report. Do not paste
doctor output that you think contains a secret into a ticket.
