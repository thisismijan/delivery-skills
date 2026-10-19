# Host adapters

An adapter is a runtime integration. The generic installer never infers a host.
Pass `--adapter <name>` after `--skills-dir`, or run the named wrapper in that
adapter directory.

| Adapter | Wrapper | Mutation boundary |
|---------|---------|-------------------|
| [`cursor`](cursor/README.md) | `adapters/cursor/install.sh` | Unenforced. Read-only stages run; mutating stages stay blocked. |
| [`claude-code`](claude-code/README.md) | `adapters/claude-code/install.sh` | Enforced after setup verifies the PreToolUse hook. |
| [`migration`](migration/README.md) | `./install.sh --adapter migration` | Compatibility reads for old state names only. |

The Cursor and Claude wrappers currently also pass `--provider gitlab` as a
convenience. That is not the only supported stack. Extra arguments are
forwarded to `install.sh`, so you can add another provider or replace GitLab:

```bash
bash adapters/cursor/install.sh --provider github
bash adapters/cursor/install.sh --provider github --provider jira
```

Later `--provider` values overlay per capability. GitHub can keep pull-request
inspection and review publication while Jira replaces work-item operations.

After install, reload the host, then from the **target repository**:

```bash
bun "$FACTORY_ROOT/scripts/doctor.ts"
bun "$FACTORY_ROOT/scripts/delivery-init.ts" --work-items <provider-id>
```

Init without `--work-items` lists options and exits until you confirm one.
Installing a provider is not consent to use it as the work-item source.
