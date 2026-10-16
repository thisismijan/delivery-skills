## 1. Tests first

- [ ] 1.1 Write failing tests for `decideCommand`: merge/close via glab, gh and API; Jira mutation via tool names and REST; force flags and plus refspecs; hard reset; GET reads allowed.
- [ ] 1.2 Write failing tests for `checkNotePublication` with fake `realpath` and `readFile`: traversal, absolute, symlink escape, secret names, secret content, clean body.
- [ ] 1.3 Write a failing test that `gl-note` calls the check before any network call, using a recording fake `glab` runner.
- [ ] 1.4 Write failing tests for `canStartStage` using enforced, unenforced and unknown host fixtures, and unknown stage.
- [ ] 1.5 Write a failing adapter round-trip test: forbidden, malformed and command-less payloads deny.
- [ ] 1.6 Write failing contract tests that mutating stage skills reference the stage gate, that the Claude Code settings hook targets the real script, and that the Cursor declaration is unenforced.

## 2. Build

- [ ] 2.1 Extend the deny list in `factory/scripts/commit-guard.ts` and export `decideCommand`.
- [ ] 2.2 Add the pure note publication check and route `gl-note` and the factory note path through it.
- [ ] 2.3 Add the host declaration and `canStartStage`, and call it from the mutating stage preconditions.
- [ ] 2.4 Make the hook entry point deny payloads with no command.
- [ ] 2.5 Update `skills/delivery/workflows/NOTES.md` and adapter READMEs to match.
- [ ] 2.6 Run `bun run test` in `factory` and confirm green.
