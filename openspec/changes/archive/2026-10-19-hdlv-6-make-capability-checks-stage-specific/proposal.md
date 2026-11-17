## Why

`/delivery auto` checks every capability before it starts, including the deployed environment and skill evaluation checks that only matter for verify or improve. An early stage therefore stops for a tool it will not use until much later. The Jira check can also report success without a real read, so a stage that needs Jira can continue without it.

## What Changes

- Capability checks become stage-specific. Only the capabilities the stage about to run needs can block it. A missing later-stage capability does not stop the current stage.
- The checks re-run at each stage boundary, so a capability that becomes necessary later is checked when that stage begins.
- When a stage needs Jira, the check performs a real ticket read through an injected probe. A failed read stops the stage. Success is never reported without the read having happened.
- The check is an executable function, `checkCapabilities(stage, probes)`, derived from the Capabilities table in the delivery skill, so the skill text and the behaviour cannot drift.
- The delivery skill and the auto workflow are reworded to match, and the "check them all once" rule is removed.

Out of scope: credential remediation, installing missing tools, and changing which humans own merge and Jira status.

## Capabilities

### New Capabilities
- `stage-capability-checks`: stage-specific capability checking with a real Jira read, re-run at every stage boundary.

### Modified Capabilities

None.

## Impact

- `skills/delivery/SKILL.md` (Phase 1 step 4 and the Capabilities table)
- `skills/delivery/workflows/auto.md` (re-check at each stage boundary)
- `skills/delivery/workflows/NOTES.md` (Jira channel wording)
- `skills/delivery/checks/` (new executable check and tests; existing spec test updated to the new rule)
