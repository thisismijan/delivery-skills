# Setup

- **Doctor** is read-only. First record every host integration tool this
  session exposes (server name and tool name, including tools that only offer
  authentication) to `.delivery/runtime/mcp-inventory.json` with
  `bun "${FACTORY_ROOT}/scripts/mcp-inventory.ts" write "$(git rev-parse --show-toplevel)" <inventory.json>`.
  Then run `bun "${FACTORY_ROOT}/scripts/doctor.ts"` in the target repository
  and print its complete Ready now, Needs setup, Host limitation, and
  Human-owned report. Doctor treats authenticated session tools as a live
  forge or tracker transport when they map the portable operations.
- **Initialize** is an explicit local mutation. First gate `init` with
  `${FACTORY_ROOT}/runtime-manifest.json`. Run `work-item-config.ts options`,
  explain the available choices with the Human decision brief (`reference/decision-brief.md`), and wait for
  explicit confirmation. Then run
  `bun "${FACTORY_ROOT}/scripts/delivery-init.ts" --work-items <provider-id>`.
  Use `--replace` only after explicit confirmation of a changed choice. Init may
  add `.delivery/` and `.review/` to `.gitignore` and persist
  `.delivery/work-items.json`; it creates no remote resource or work item.
  Then ask where created work items should land. By default a provider assigns
  each new item to the user its credentials belong to. A provider with sprints
  plans it into the board's active sprint once its board is recorded. Show the
  operator the provider's placement settings from its README: who items are
  assigned to, and which sprint or milestone they go into. Record each value
  the operator chooses with
  `bun "${FACTORY_ROOT}/scripts/delivery-init.ts" --work-items <provider-id> --setting <key>=<value>`.
  When they keep the defaults, record nothing.
  Then map the board. Pick one existing ticket and run
  `bun "${FACTORY_ROOT}/scripts/board-status.ts" propose "<repoRoot>" "${FACTORY_ROOT}/runtime-manifest.json" <work-item-key>`.
  Show the operator the board columns, each proposed phase (`ready`,
  `in-progress`, `in-review`, `done`), and every ambiguous column or
  unresolved phase, with the Human decision brief (`reference/decision-brief.md`). Never pick a column for
  an unresolved phase yourself. After the operator confirms or edits the map,
  write it with their exact words under `approval` and run
  `bun "${FACTORY_ROOT}/scripts/board-status.ts" confirm "<repoRoot>" <board-map.json>`.
  When `propose` fails or the operator declines, record that tickets will not
  move and continue; every sync then skips.
  Then ask which local files git ignores should be copied into each worker's
  worktree, such as `.env`. Run
  `bun "${FACTORY_ROOT}/scripts/worktree-files.ts" propose "<repoRoot>"` and show
  the candidate paths; never show their contents. Only exact paths the operator
  names are saved: write them with their exact words under `approval` and run
  `bun "${FACTORY_ROOT}/scripts/worktree-files.ts" confirm "<repoRoot>" <worktree-files.json>`.
  When the operator names none, write nothing; workers then get only tracked
  files.
  Then ask whether parallel workers should run in containers. Only when the
  operator says yes, draft `.delivery/sandbox.json` with them: `engine`
  (`docker` or `podman`), a local `image` that has `sleep`, git, the host's
  command-line agent, and this pack's mutation guard installed, `network`
  (`none`, or `open` only when they accept unrestricted egress), `env` (the
  variable names a worker needs, never their values), `setup` (install
  commands as argument lists), and `worker` (the host's headless command that
  runs `/delivery auto {key}`). Show the whole draft, write their exact words
  under `approval`, then run
  `bun "${FACTORY_ROOT}/scripts/sandbox-run.ts" confirm "<repoRoot>" <sandbox.json>`
  and `bun "${FACTORY_ROOT}/scripts/sandbox-run.ts" check "<repoRoot>"`, and
  show the result. When they decline, write nothing; workers then run in
  plain worktrees.

## Never

- Never pick a work-item provider, a placement setting, a board column, a
  worktree file, or a sandbox setting for the operator.
- Never show the contents of a candidate worktree file.
- Never create a remote resource or a work item during setup.

## Terminal stops

- A failed `init` gate stops with its remedy and changes nothing.
- A confirmed sandbox that fails `check` is reported as it is; auto later
  refuses to fan out without it rather than run workers unsandboxed.

## Ledger writes

None. Setup writes only `.delivery/work-items.json`, the board map,
`.delivery/worktree-files.json`, and `.delivery/sandbox.json`, each with the
operator's exact words where it records a choice.
