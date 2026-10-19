# Troubleshooting

Run doctor from the target repository:

```bash
bun "$FACTORY_ROOT/scripts/doctor.ts"
```

## Bun missing or wrong version

The installer stops if Bun is missing and prints:

```bash
curl -fsSL https://bun.sh/install | bash -s "bun-v1.4.2"
```

Restart the shell, confirm `bun --version`, and rerun install. An older Bun
earlier on `PATH` (often Homebrew) keeps doctor listing a setup item; put
`~/.bun/bin` first or uninstall that package. Read-only stages can still run
on a present but unpinned Bun. `DELIVERY_INSTALL_SKIP_BUN` is for tests only.

## Tools installed but doctor says missing

Provider binaries land in `${DELIVERY_BIN_DIR:-$HOME/.local/bin}`. Add that
directory to `PATH` in the same shell the host uses for subprocesses.

## Cursor mutating stages blocked

Reload Cursor after install so `~/.cursor/hooks.json` loads. Doctor should
show Mutation guard as ready. If it still asks you to rerun the Cursor
adapter, set `CURSOR_HOOKS_FILE` if you keep hooks outside the default path,
then reinstall. Read-only stages still run while the hook is missing.
Do not merge, close, force-push, hard-reset, or mutate tracker status from
the agent.

## GitHub install still looked like GitLab

Older doctor always probed GitLab tools. Current doctor follows the runtime
manifest. Reinstall, then confirm the report names `github-forge` rather than
`gitlab-forge`. Wrappers still default to GitLab unless you pass
`--provider github`.

## Init exits 1

`delivery-init.ts` without `--work-items` lists providers and exits until you
confirm one. Pass `--work-items local-files` (or `github` / `gitlab` / `jira`).
Init exits 0 when the work-item provider is confirmed and read-only lifecycle
is ready; remaining optional setup is printed without failing the command.

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

## Pipeline is still waiting

Waiting is expected while the exact revision is queued, running, or not visible
yet. Delivery subscribes to a host event when one is available and ends the
turn; it does not poll in the background. If no event wakes the run, use the
resume command it printed:

```text
/delivery auto <KEY>
```

Each resume reads forge evidence again. An event payload is only a wake-up
signal and never substitutes for exact-revision status.

## Merge request was green but the default branch failed

These are separate checkpoints. Resume `/delivery auto <KEY>` so delivery can
inspect the exact merged revision. If the failure is attributable, within the
frozen run contract, and under the attempt budget, recovery uses a new reviewed
change. Delivery does not push to the default branch or revert the merge.

If the failure is transient, unrelated, ambiguous, outside approved scope, or
over budget, the run stops with the revision, failed checks, sanitized
evidence, and suggested owner. A provider retry remains a human action; retry it
in the forge and then resume delivery.

## Pipeline status belongs to another revision

Do not treat it as success. Confirm that the forge provider can read the exact
change head or merged revision and that credentials permit pipeline evidence.
GitHub tokens may need access to statuses or check runs. Missing or stale
evidence fails closed rather than falling back to the branch's latest pipeline.

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
