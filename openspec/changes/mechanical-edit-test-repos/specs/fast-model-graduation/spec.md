## ADDED Requirements

### Requirement: Test-repo stand-in scores are not graduation evidence

A local identifier rewrite in a temporary git test repo SHALL be recorded with evaluation provenance `test-repo-stand-in`. Fast-model graduation and fast dispatch MUST NOT count those scores. An operator promotion approval MUST NOT make them count.

#### Scenario: Stand-in scores do not fill the sample
- **WHEN** five or more representative-run scores for a candidate exist with provenance `test-repo-stand-in`, utility at or above 90 percent, and no critical misses
- **THEN** the representative sample size is zero and the model remains evaluation-only

#### Scenario: Approval does not promote stand-in scores
- **WHEN** promotion is applied with only `test-repo-stand-in` scores for Haiku and an operator promotion approval that names Haiku
- **THEN** Haiku remains evaluation-only

### Requirement: Unscripted fixtures run as git test repositories

The unscripted mechanical-edit pack SHALL materialize each fixture as an isolated git test repository, prove scripted apply stays `select-model`, and write paired corpus output to a caller-supplied directory. Running that loop SHALL NOT change live catalogue availability.

#### Scenario: Each fixture is a git repository
- **WHEN** the unscripted pack is materialized as test repositories
- **THEN** each fixture root contains a git repository and the listed fixture files

#### Scenario: Scripted apply still keeps today's worker
- **WHEN** the mechanical-edit helper is applied to a materialized test repository
- **THEN** it reports `apply: select-model`

#### Scenario: The loop does not promote Haiku
- **WHEN** the test-repo paired loop writes corpus scores for Haiku
- **THEN** Haiku remains evaluation-only and the live catalogue is unchanged
