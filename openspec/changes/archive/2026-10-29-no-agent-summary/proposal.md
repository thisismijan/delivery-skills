## Why

Claude Code spends a large share of a run's tokens on a side query that
only writes a three-word status line for background agents. Factory
workers on that host pay that cost on every long run, and there is no
supported switch that turns the query off.

## What Changes

- The Claude Code adapter ships the MIT Bun preload that skips the
  summary timer.
- Adapter setup copies it next to the installed factory and adds
  `--preload` to `BUN_OPTIONS` in Claude settings, keeping any flags
  already there.
- The hook installs only inside Claude Code's compiled Bun image, so
  ordinary factory `bun` processes are unchanged.
- Doctor reports whether the preload is in the live settings. Missing
  it is setup, not a blocked stage.
- Cursor is unchanged. Restarting the Claude daemon after install is
  still required.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `cost-efficient-routing`: Claude Code workers do not spend tokens on
  the agent status-line summary.

## Impact

- `adapters/claude-code/`
- `factory/scripts/claude-settings.ts`
- `factory/scripts/doctor.ts`
