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

## Session tools present but doctor still wants CLI adapters

Run `/delivery doctor` from the host that exposes those tools so it can write
`.delivery/runtime/mcp-inventory.json`. Doctor cannot see session tools from a
plain terminal unless that file already exists. Authenticate a server that only
exposes `mcp_auth`, then rerun doctor. Remaining operations that the session
does not map still need the CLI adapter.

## Tools installed but doctor says missing

Provider binaries land in `${DELIVERY_BIN_DIR:-$HOME/.local/bin}`. Add that
directory to `PATH` in the same shell the host uses for subprocesses.

## Cursor mutating stages blocked

Reload Cursor after install so `~/.cursor/hooks.json` loads. Doctor should
show Mutation guard as ready. If it still asks you to rerun the Cursor
adapter, set `CURSOR_HOOKS_FILE` if you keep hooks outside the default path,
then reinstall. Read-only stages still run while the hook is missing.
Do not merge, close, force-push, or hard-reset from the agent, and do not
move tickets other than through `board-status.ts sync`.

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

## Run stops with "frozen under an older SDLC constitution"

The pack was upgraded under a run, and the new constitution changed the list
of actions people own. The run's frozen contract no longer matches. Nothing is
lost: the message names the changed action and the contract's hash. Approve
the plan again as the next plan version, with `supersedesHash` set to that
hash, a reason, and the affected invariant. Freeze it, then run
`sdlc-constitution.ts supersede <old-contract.json> <new-contract.json>`. When
that passes, the new contract replaces the old one and the run carries on.

## Run stops with "this run was approved at the min level"

The level is part of the approved plan. Resuming with a different level word
stops instead of quietly changing how much the run spends. Resume without a
level word to keep the approved level. To change it, ask delivery for a new
plan version at the new level, give the reason, and approve it.

## "Unknown delivery level" or "Name one delivery level, not two"

The level words are `min`, `standard`, and `max`, in lowercase, either first
or right after the verb. `DELIVERY_LEVEL` in the environment must be one of
the same three; anything else fails closed before any stage runs.

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

## Execute stops for a red zone

`risk-zones.ts check` or `check-diff` exited 3: the change's plan or its diff
reaches a red zone in `.delivery/zones`. A person approves by adding an
Approvals line to the run ledger in their own words that names
`red-zone <changeName>`, then resumes. Plan approval and
`continuous-delivery: yes` do not count. Exit 1 means the map has a line that
is not `red <path>` or `yellow <path>`; doctor names it.

## Branch update stopped

`branch-update.ts` exit 4 means someone pushed to the change branch after
delivery read it, so nothing was pushed. Look at what they added, then resume
with `/delivery auto <KEY>`. Exit 1 usually means the worktree had uncommitted
files or was not at the expected head. A conflict-resolver handoff that lists
anything under **Could not keep** also stops: resolve that hunk by hand.

## Sandbox containers left behind

Doctor lists containers from runs whose coordinator stopped. Remove one run's
containers with
`bun "$FACTORY_ROOT/scripts/sandbox-run.ts" reap <repoRoot> <run-id>`. It
touches only containers labelled with that run and exits 1 if the engine
refuses one.

## Improvement evaluation asks for more runs

`paired-evaluation.ts` exit 3 is a close call at three runs per arm. Add runs 4
and 5 to the same plan (baseline first, then candidate first), regenerate the
evidence, and evaluate again. Five runs always decide. Evidence with one run
per arm is refused.

## Skill size check fails

A `SKILL.md` grew past its ceiling in `factory/skill-size-ceilings.json`. Slim
it, or raise the ceiling with
`bun scripts/skill-size.ts raise skills/<name>/SKILL.md` in the same change.

## Doctor says the Cursor plugin drifted

The plugin's agents or stage-skill markings no longer match the factory it
carries, usually after pulling a new pack version without reinstalling the
plugin. A judge listed as "not read-only" can edit files. Reinstall with
`bash adapters/cursor/install-plugin.sh` and reload Cursor.
