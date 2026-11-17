## ADDED Requirements

### Requirement: Claude Code does not spend tokens on agent status summaries

When the Claude Code adapter is installed, it SHALL persist a Bun preload
that skips Claude Code's agent status-summary timer, and SHALL add that
preload to `BUN_OPTIONS` in Claude settings without dropping other flags.
The preload SHALL install only inside Claude Code's compiled Bun image.
Doctor SHALL report whether the live settings carry the preload. A missing
preload SHALL be setup advice, not a blocked stage.

#### Scenario: Claude adapter setup wires the preload
- **WHEN** the Claude Code adapter setup runs
- **THEN** the installed factory holds the preload file
- **AND** Claude settings `env.BUN_OPTIONS` includes `--preload` with that absolute path
- **AND** existing `BUN_OPTIONS` flags remain

#### Scenario: Ordinary bun processes are not hooked
- **WHEN** the preload is loaded by a factory `bun` process whose main path is not Claude Code's compiled image
- **THEN** it does not wrap timers

#### Scenario: Cursor install is unchanged
- **WHEN** only the Cursor adapter is installed
- **THEN** no Claude settings `BUN_OPTIONS` preload is written
