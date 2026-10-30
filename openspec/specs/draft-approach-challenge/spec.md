# draft-approach-challenge Specification

## Purpose
Find the cases a planned approach would miss while it is still a spec, so a
design that cannot be made complete is revised once or handed to a person
before any code is written, instead of being patched one review round at a
time.

## Requirements

### Requirement: Draft challenges the planned approach once before committing it
Unless feasibility rated the change low complexity, `/draft` SHALL dispatch
one read-only `approach-challenger` after authoring the spec and before
verifying it. `draft-route.ts approach` SHALL route `sound` to proceed and
`gaps` to adding each gap as a scenario or a stated non-goal. A first
`rethink` SHALL revise the design and challenge once more, and a second
`rethink` SHALL stop with exit 3 for a person to choose. A malformed or
contradictory verdict SHALL stop the draft.

#### Scenario: Low complexity
- **WHEN** feasibility rated the change low complexity
- **THEN** no challenger is dispatched and the skip is recorded

#### Scenario: Gaps
- **WHEN** the challenger finds concrete cases the approach misses but the approach is right
- **THEN** each becomes a scenario or a stated non-goal and the draft continues without another challenge

#### Scenario: Approach cannot be made complete
- **WHEN** the challenger returns rethink twice
- **THEN** the first revises the design and the second stops the draft

#### Scenario: Contradictory verdict
- **WHEN** a verdict says sound but lists gaps, or rethink without an alternative
- **THEN** the verdict is refused and the draft stops
