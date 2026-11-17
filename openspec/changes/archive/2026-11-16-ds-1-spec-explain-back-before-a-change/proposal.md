## Why

No fresh reader checks a drafted change before build. When the change leans on grilling context, implementers and test writers guess, and the holdout reviewer finds the gap only after code exists.

## What Changes

- Add a read-only explain-back check after approach challenge and before artifact verification
- Route its verdict fail closed: gaps or misreads get one revision, then a person decides
- Keep the reader isolated from the work item and grooming decisions
- Run the check on every draft at the standard model tier (no low-complexity skip)

## Capabilities

### New Capabilities

- `draft-spec-comprehension`: fresh-reader explain-back gate in `/draft`

### Modified Capabilities

- `draft-approach-challenge`: order relative to explain-back (explain-back runs after approach challenge)

## Impact

- `skills/draft/SKILL.md` gains a step after 7a and before verify
- `factory/agents/` gains a read-only judge agent
- `factory/scripts/verdicts.ts` and `draft-route.ts` gain a comprehension verdict and route
- Constitution draft stops may gain an unsettled-comprehension stop id
- Tests cover parsing, routing, and workflow contracts
