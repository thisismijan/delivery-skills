## Why

Human-owned actions (merge, close, Jira status changes, force-push, hard reset) are promised on every host, but only a Claude Code Bash hook enforces them. Cursor relies on prose, factory notes can bypass the jailed `gl-note` publisher, and equivalent API calls (`glab api`, `gh api`, `curl`) are not covered. Mutating stages can start on a host with no enforceable boundary.

## What Changes

- Extend the command guard so merge, close, Jira mutation, force refspecs, hard reset, and equivalent `glab`/`gh`/`curl` API calls are denied, while read-only calls stay allowed.
- Add a note publication check that refuses a body outside `.review/` or one that looks secret-bearing, and route every note publisher through it.
- Add a stage-start gate: mutating stages stop on a host that does not declare enforced mutation boundaries; read-only stages stay available.
- Declare Claude Code as enforced and Cursor as unenforced until real enforcement exists, so Cursor mutating stages stay blocked.
- Keep the Claude Code hook as a thin adapter over the same pure decisions.

Out of scope: automating merge or Jira transitions, and changing which humans own those actions.

## Capabilities

### New Capabilities
- `mutation-boundary`: deterministic denial of human-owned commands and equivalent API calls, and the hook adapter payload contract.
- `note-publication`: the path jail and secret-like content refusal for published notes.
- `stage-gating`: the host enforcement declaration and the stage-start gate.

### Modified Capabilities
None.

## Impact

- `factory/scripts/commit-guard.ts` and its tests, plus new pure modules beside it.
- `skills/mr-review/gl-note` and the factory note path.
- `factory/scripts/preflight.ts`, mutating stage skills (`execute`, `delivery`), and `adapters/*`.
- `skills/delivery/workflows/NOTES.md` and the workflow contract tests.
