# Getting started

Pinned runtime: Bun `1.4.2` (`factory/package.json` `packageManager`). Put
`${DELIVERY_BIN_DIR:-$HOME/.local/bin}` on `PATH` so installed provider tools
are visible to doctor.

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

Claude Code is the same pattern with `adapters/claude-code/install.sh`. That
wrapper also installs and verifies a mutation hook; Cursor does not.

## 2. Reload and diagnose

Reload the host session so it loads the installed skills. Enter the git
repository you want to deliver, then:

```bash
export FACTORY_ROOT="/path/to/skills/_factory"
bun "$FACTORY_ROOT/scripts/doctor.ts"
```

Doctor groups **Ready now**, **Needs setup**, **Host limitation**, and
**Human-owned**. It reports credential presence, never values. Core runtime
can be ready while optional forge, tracker, or OpenSpec tools still need
setup.

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

Init also adds `.delivery/` and `.review/` to `.gitignore` once.

## 4. Run delivery

```text
/delivery help
/delivery doctor
/delivery status
/delivery <idea or PRD path>
```

Read-only stages run with a smaller capability set. Mutating stages need
`mutation.guard` with `enforcement: "enforced"`. On Cursor that stays a host
limitation until a real denial hook exists.

See [workflow](workflow.md) and [examples](examples.md) next.
