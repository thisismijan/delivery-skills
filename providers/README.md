# Providers

Providers are optional forge, work-item, and spec-tool packages. Generic
install includes none. Repeat `--provider <name>`; later overlays win per
capability.

| Provider | Capabilities when ready | Work items |
|----------|-------------------------|------------|
| (none) | None remote | [`local-files`](../factory/WORK-ITEMS.md) is always available |
| [`github`](github/README.md) | `forge.change`, `review.publish`, `tracker.item` | GitHub issues after explicit confirm |
| [`gitlab`](gitlab/README.md) | `forge.change`, `review.publish`, `tracker.item` | GitLab issues after explicit confirm |
| [`jira`](jira/README.md) | `tracker.item` only | Jira Cloud issues after explicit confirm |
| [`openspec`](openspec/README.md) | OpenSpec CLI on PATH | Not a work-item source |

## Mixed stacks

Forge and tracker can differ:

```bash
./install.sh --skills-dir /path/to/skills \
  --provider github --provider jira
```

That keeps GitHub pull requests and review notes, and uses Jira for tickets.
The same pattern works with GitLab forge plus Jira.

Do not install two forge providers and expect both to stay live. The last
overlay owns `forge.change` and `review.publish`.

## Consent

Installing a provider only advertises a capability. The repository still
confirms one work-item source with `/delivery init` or
`delivery-init.ts --work-items <id>`. Remotes, tokens, and issue-key shape are
never treated as that choice.

## Readiness

Doctor probes **selected** providers from the runtime manifest. A GitHub
install is not asked for GitLab tools. A Jira-only overlay still needs a
separate forge provider before review publication.

Put `${DELIVERY_BIN_DIR:-$HOME/.local/bin}` on `PATH` after setup.
