# Examples

Replace `/path/to/skills` with the `--skills-dir` you installed into. Run
every doctor and init command from the **target git repository**.

## Local files only

Useful for a private repo with no tracker.

```bash
./install.sh --skills-dir /path/to/skills
export FACTORY_ROOT="/path/to/skills/_factory"
export PATH="${DELIVERY_BIN_DIR:-$HOME/.local/bin}:$PATH"
bun "$FACTORY_ROOT/scripts/doctor.ts"
bun "$FACTORY_ROOT/scripts/delivery-init.ts" --work-items local-files
```

Doctor should show read-only lifecycle ready. Forge and remote work items remain
**Needs setup**; that is expected. The generic install is a read-only bootstrap:
it can groom and create local keys such as `LOCAL-1`, but draft, execute, and
auto stay blocked until a host adapter verifies its denial hook. Reinstall with
`--adapter cursor` or `--adapter claude-code`, then rerun doctor. Execute also
cannot open a pull request until you add a forge provider.

`.delivery/work-items.json` looks like:

```json
{
  "version": 1,
  "provider": { "id": "local-files", "kind": "local-files" },
  "confirmed": true
}
```

## GitHub pull requests and GitHub issues

```bash
export GITHUB_TOKEN="ghp_…"   # or GH_TOKEN / GH_TOKEN_FILE / ~/token
bash adapters/cursor/install.sh --provider github
export FACTORY_ROOT="${CURSOR_SKILLS_DIR:-$HOME/.cursor/skills}/_factory"
bun "$FACTORY_ROOT/scripts/doctor.ts"
bun "$FACTORY_ROOT/scripts/delivery-init.ts" --work-items github
```

Doctor should list `github-forge`, `github-tracker`, and **GitHub credential**
under Ready now when PATH and the token are present. It must not ask for
GitLab tools.

Reload Cursor after install so the verified `hooks.json` hook loads. Doctor
should then show Mutation guard as ready for mutating stages.

## GitLab merge requests and GitLab issues

```bash
export GITLAB_TOKEN="glpat-…"
bash adapters/claude-code/install.sh
export FACTORY_ROOT="${CLAUDE_SKILLS_DIR:-$HOME/.claude/skills}/_factory"
bun "$FACTORY_ROOT/scripts/doctor.ts"
bun "$FACTORY_ROOT/scripts/delivery-init.ts" --work-items gitlab
```

The Claude wrapper already selects GitLab. Self-hosted GitLab also needs
`GL_HOST` / `GL_PROJECT` when origin is not enough. See
[`providers/gitlab/README.md`](../providers/gitlab/README.md).

## GitHub pull requests and Jira tickets

```bash
export GITHUB_TOKEN="ghp_…"
export JIRA_SITE="https://example.atlassian.net"
export JIRA_EMAIL="you@example.com"
export JIRA_API_TOKEN="…"
./install.sh --skills-dir /path/to/skills \
  --adapter claude-code \
  --provider github --provider jira
bun "$FACTORY_ROOT/scripts/doctor.ts"
bun "$FACTORY_ROOT/scripts/delivery-init.ts" --work-items jira --setting project=DEL
```

Doctor should show GitHub forge tools plus `jira-tracker` and both
credentials. Confirm **jira**, not github, as the work-item provider. The
project key belongs to the repository, so run init with `--setting project=`
in each repository; one machine can serve several projects.

## From green review through merge

Continue or resume the lifecycle with:

```text
/delivery auto <KEY>
```

Before merge, delivery checks the pipeline for the exact change head. If it is
still running, delivery subscribes to a completion event when the host supports
that and ends the turn. Otherwise it leaves the same command as the resume
instruction. A green pipeline returns the change to the land gate: once you
approve it on the forge, auto squash-merges it at that exact head.

After it merges, run `/delivery auto <KEY>` again if no event wakes the run.
Delivery reads the merged revision and checks that exact commit on the default
branch. Only a passing result proceeds to archive, deployment verification, and
retro. Do not run archive early based only on the pre-merge pipeline.

For example, if the merged revision fails because its changed configuration is
invalid, delivery may open a new draft recovery change when the repair is inside
the approved contract and attempt budget. If a runner outage caused the failure,
delivery escalates with the failed checks and evidence instead of changing code
or blindly retrying the provider job.
