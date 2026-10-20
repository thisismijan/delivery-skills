# Getting started

Pinned runtime: Bun `1.4.2` (`factory/package.json` `packageManager`). The
installer checks that version before copying files and prints the exact
install command when Bun is missing or unmatched. Put
`${DELIVERY_BIN_DIR:-$HOME/.local/bin}` on `PATH` so installed provider tools
are visible to doctor.

Cursor can enforce mutating stages after its adapter writes and verifies
`~/.cursor/hooks.json`. Reload Cursor after install so that hook loads. Until
doctor shows Mutation guard as ready, only read-only stages run.

## 1. Clone and install

```bash
git clone https://gitlab.com/Sheikh.Ahmed1/delivery-skills.git
cd delivery-skills
./install.sh --help
```

`--skills-dir` is required. Named host wrappers live under
[`adapters/`](../adapters/README.md). Forge and tracker packages live under
[`providers/`](../providers/README.md). `--provider` may be repeated.

Generic install (no host overlay, no remote provider):

```bash
./install.sh --skills-dir .agents/skills
```

Typical GitHub personal-skills install on Cursor, replacing the wrapper's
default GitLab provider:

```bash
bash adapters/cursor/install.sh --provider github
```

GitHub pull requests with Jira tickets:

```bash
bash adapters/cursor/install.sh --provider github --provider jira
```

Claude Code is the same pattern with `adapters/claude-code/install.sh`. Both
host wrappers install and verify a denial hook. Reload the host before
mutating stages.

## 2. Reload and diagnose

Reload the host session so it loads the installed skills. Enter the git
repository you want to deliver, then:

```bash
export FACTORY_ROOT="/path/to/skills/_factory"
bun "$FACTORY_ROOT/scripts/doctor.ts"
```

Doctor groups **Ready now**, **Needs setup**, **Host limitation**, and
**Human-owned**. It reports credential presence, never values. It distinguishes
**read-only lifecycle** from **full lifecycle**. An unpinned Bun version is a
setup item, not a read-only blocker. Mutating stages still need a verified
denial hook. Optional forge, tracker, or OpenSpec tools can remain unset.
If the host has GitHub, GitLab, or Atlassian session tools, doctor records
them and treats authenticated mappings as a live transport.

## 3. Confirm work items

```bash
bun "$FACTORY_ROOT/scripts/work-item-config.ts" options \
  "$FACTORY_ROOT/runtime-manifest.json"
bun "$FACTORY_ROOT/scripts/delivery-init.ts" --work-items local-files
```

Use a remote id (`github`, `gitlab`, `jira`) only when doctor shows that
tracker as ready. Init without `--work-items` prints the list and exits
non-zero until you confirm. The choice is stored in
`.delivery/work-items.json`.

For Jira through Atlassian session tools, record both repository settings:

```bash
bun "$FACTORY_ROOT/scripts/delivery-init.ts" --work-items jira \
  --setting project=DEL --setting site=https://example.atlassian.net
```

Init also adds `.delivery/` and `.review/` to `.gitignore` once. After
configuration it reprints only unresolved doctor checks, not the full ready
and human-owned lists.

## 4. Run delivery

```text
/delivery help
/delivery doctor
/delivery status
/delivery <idea or PRD path>
```

Read-only stages run with a smaller capability set. Mutating stages need
`mutation.guard` with `enforcement: "enforced"` after the host adapter
verifies its denial hook.

See [workflow](workflow.md) and [examples](examples.md) next.
