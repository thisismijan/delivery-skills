## Why

The Cursor adapter installed the pack by copying skills and the factory into
Cursor's skill locations. The judging agents, such as the holdout reviewer,
were read-only only because their prompts listed read-only tools. Cursor did
not enforce it, so a judge could in principle change the code it judged.

## What Changes

- `adapters/cursor/install-plugin.sh` runs the existing install inside a local
  Cursor plugin folder (default `~/.cursor/plugins/local/delivery`). It then
  runs `cursor-plugin.ts build <plugin-dir> <factory-root>`.
- The build writes `.cursor-plugin/plugin.json` and one agent per factory
  agent. An agent whose declared tools cannot write files or run commands is
  marked `readonly: true`, so Cursor runs it without file edits or
  state-changing commands. The writing agents stay writable.
- The runtime tells every skill to dispatch a host-provided subagent of the
  named agent's exact name, so the host applies its declared permissions.
- The plain install is unchanged.

Out of scope: removing the existing install, marking stage skills not
model-invocable, publishing to a marketplace, and other hosts.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `generic-skill-packaging`: the pack can be installed as a Cursor plugin whose
  judging agents the host runs read-only.

## Impact

`factory/scripts/cursor-plugin.ts` and its tests,
`adapters/cursor/install-plugin.sh`, `adapters/cursor/README.md`,
`factory/RUNTIME.md`, and `docs/reference.md`.
