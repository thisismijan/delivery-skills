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

Doctor should show core runtime ready. Forge and remote work items remain
**Needs setup**; that is expected. `/delivery` still grooms into `.delivery/work-items/`
keys such as `LOCAL-1`. Execute cannot open a pull request until you add a
forge provider.

`.delivery/work-items.json` looks like:

```json
{
  "version": 1,
  "provider": { "id": "local-files", "kind": "local-files" }
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

On Cursor, mutation guard stays a host limitation. Use Claude Code with
`--provider github` when you need mutating stages.

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
export JIRA_PROJECT="DEL"
export JIRA_EMAIL="you@example.com"
export JIRA_API_TOKEN="…"
./install.sh --skills-dir /path/to/skills \
  --adapter claude-code \
  --provider github --provider jira
bun "$FACTORY_ROOT/scripts/doctor.ts"
bun "$FACTORY_ROOT/scripts/delivery-init.ts" --work-items jira
```

Doctor should show GitHub forge tools plus `jira-tracker` and both
credentials. Confirm **jira**, not github, as the work-item provider.

## After a green review

You merge the change. Then:

```text
/delivery archive <KEY>
/delivery verify <iid>
/delivery retro <KEY>
```
