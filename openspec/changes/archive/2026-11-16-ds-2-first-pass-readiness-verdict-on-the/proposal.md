## Why

A drafted change can be clear enough to explain back and still not be enough to build from. A scenario nobody can test, a reference to a file that does not exist, an interface with no name, or a task list that disagrees with the specs all send the implementer back to guessing. Nothing in `/draft` judges this before the build, so the gap shows up later as a failed red gate or a holdout rejection.

## What Changes

- Add a first-pass readiness check after explain-back passes and before artifact verification
- A fresh, read-only reviewer on the frontier tier answers one question about the change only: could an implementer succeed on the first pass from this change alone?
- Four findings make a change not ready, and each is reported: an untestable scenario, a referenced file that is neither present in the repository nor marked new in the change, an unnamed interface, or a contradiction with the task list
- Route the verdict fail closed: a not ready verdict gets one revision (with the task list regenerated), then a person decides, under a stop id of its own
- Skip the check when feasibility rated the work low complexity, and record the skip
- Keep the reviewer isolated from the work item, grooming decisions, and draft review scratch

## Capabilities

### New Capabilities

- `draft-first-pass-readiness`: fresh-reviewer readiness gate in `/draft`, its verdict contract, its low complexity skip, and its escalation stop

### Modified Capabilities

None. The explain-back gate and the approach challenge are not changed. The step after explain-back moves from artifact verification to this check, which this change states as its own ordering requirement.

## Out of Scope

- Judging the ticket itself
- The explain-back check
- Skipping readiness for any reason other than a low complexity feasibility rating
- Retrying a malformed verdict with a fresh agent

## Impact

- `skills/draft/SKILL.md` gains a step between explain-back (7b) and artifact verification (8), and explain-back now continues to that step
- `factory/agents/first-pass-reviewer.md` (new) is a read-only frontier reviewer
- `factory/scripts/verdicts.ts` gains a readiness verdict and its parser
- `factory/scripts/draft-route.ts` gains a readiness route and a `readiness` mode
- `factory/scripts/record-skip.ts` gains the worker name `first-pass-reviewer` in its closed skip list
- `skills/delivery/sdlc-constitution.json` gains the draft stop `unready-change`
- `factory/CONVENTIONS.md` and `docs/reference.md` describe the new agent, step, and stop
- `factory/scripts/workflow-contracts.test.ts` and `factory/scripts/explain-back.test.ts` have step-order assertions updated, and `factory/scripts/first-pass-readiness.test.ts` (new) covers the new behaviour
