## Why

The Cursor plugin is built from the pack at install time. After a pack update
without a plugin reinstall, its agents, read-only flags, and stage-skill
markings can lag the factory it carries, and nothing said so. A stale plugin
could leave a judge writable.

## What Changes

- `pluginDrift` in `cursor-plugin.ts` recognises a plugin install, where the
  factory sits at `<plugin>/skills/_factory`. It compares the plugin with what
  the build would write from that factory and names each difference:
  - an agent that is missing, not read-only, or changed;
  - an agent the factory no longer has;
  - a stage skill the model can start.
- `/delivery doctor` reports it as ready when the plugin matches, or as a setup
  item naming the differences and the reinstall command. A plain install gets
  no plugin check.

Out of scope: rebuilding the plugin automatically, and other hosts.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `generic-skill-packaging`: doctor detects a plugin that has fallen behind
  its factory.

## Impact

`factory/scripts/cursor-plugin.ts`, `factory/scripts/doctor.ts`, their tests,
`adapters/cursor/README.md`, and `docs/troubleshooting.md`.
