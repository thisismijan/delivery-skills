## 1. Tests first

- [x] 1.1 Write failing tests for `checkCapabilities(stage, probes)` using fake probes and the real Capabilities table: later-stage failures do not block an early stage
- [x] 1.2 Write a failing test that a failed capability the stage needs stops it and names the capability, blocked stages, and fix
- [x] 1.3 Write failing tests for the Jira probe: a failed read stops the stage, a probe returning no ticket stops it, and a recording fake proves it is called exactly once when needed
- [x] 1.4 Write a failing test that a recording runner shows the check running again at each stage boundary
- [x] 1.5 Update the spec test that pins "check them all once" to assert per-stage checking and re-check at each stage start

## 2. Implementation

- [x] 2.1 Implement `checkCapabilities` in `skills/delivery/checks/capabilities.ts`, reading the `Needed by` column of the table
- [x] 2.2 Reword `skills/delivery/SKILL.md` Phase 1 step 4 and the Jira check to a real ticket read
- [x] 2.3 Update `skills/delivery/workflows/auto.md` to re-check at each stage boundary
- [x] 2.4 Mark the `NOTES.md` Jira channel line as informational, not a check result
- [x] 2.5 Run the root test suite and confirm it is green
