## ADDED Requirements

### Requirement: A run has one level that sets its cost knobs
A run SHALL have exactly one level: `min`, `standard`, or `max`. The level
SHALL set the parallel worktree limit, the fix-attempt budget, the review
round limit, the review breadth, and the implementer tier. `standard` SHALL
equal the defaults that applied before levels existed. An explicitly set
`MAX_PARALLEL_WORKTREES`, `MAX_FIX_ATTEMPTS`, or `MAX_REVIEW_ROUNDS` SHALL
win for that knob and be reported as an override.

#### Scenario: No level named
- **WHEN** a new run names no level
- **THEN** it runs at `standard` with the previous defaults

#### Scenario: Level and an override
- **WHEN** the level is `max` and `MAX_PARALLEL_WORKTREES` is 3
- **THEN** three workers run at once, the other `max` values apply, and the override is listed

#### Scenario: Unknown level
- **WHEN** `DELIVERY_LEVEL` is not one of the three levels
- **THEN** configuration fails closed

### Requirement: The level is read from one position in the command
The conductor SHALL take a level only from the first word or the word right
after the verb, and SHALL treat the same word anywhere else as ordinary
text. Two level words SHALL stop the command.

#### Scenario: Level after the verb
- **WHEN** the operator types `/delivery auto max MDF-1234`
- **THEN** auto runs for `MDF-1234` at `max`

#### Scenario: Level in prose
- **WHEN** an idea contains the word max later in the sentence
- **THEN** the idea is unchanged and no level is set

### Requirement: The level is frozen in the run contract
The run contract SHALL record the level. A contract without a level SHALL run
as `standard`. `sdlc-constitution.ts level` SHALL exit non-zero when the
requested level differs from the contract's, and a level change SHALL need a
superseding plan with a new approval.

#### Scenario: Resume at a different level
- **WHEN** a run approved at `min` is resumed with `max`
- **THEN** the level check fails and names the supersede path

### Requirement: No level weakens a correctness gate
No level SHALL change holdout review, the review chain, the frontier review
model, release-readiness lenses, the land gate, fast-model evaluation, or any
human-owned decision. At `min`, review lenses SHALL be trimmed only when size
alone added them.

#### Scenario: Sensitive change at min
- **WHEN** a change touches a sensitive surface, changes a dependency, is one-way, or was not fully classified
- **THEN** it gets the same review lenses at `min` as at `standard`

#### Scenario: Readiness at min
- **WHEN** release readiness runs at `min`
- **THEN** it uses the same lenses as at `standard`

#### Scenario: Review model at every level
- **WHEN** the review step selects its model at any level
- **THEN** it is the frontier model
