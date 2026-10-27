## ADDED Requirements

### Requirement: Captured model-run trees can be scored as graduation evidence

A complete paired capture of a baseline worker and an exact evaluation-only candidate SHALL be scored with provenance `model-run` and source representative-run. Ingest SHALL require token usage with wall time, named workers, and at least one hidden check. Scoring SHALL NOT change live catalogue availability.

#### Scenario: A complete capture is scored as a model run
- **WHEN** ingest is given a complete paired capture for an unscripted fixture
- **THEN** the corpus entry uses provenance `model-run` and names the exact candidate

#### Scenario: Model-run scores still do not promote without approval
- **WHEN** five or more ingested `model-run` scores for an exact fast catalogue candidate clear the 90 percent bar with no critical misses and there is no operator promotion approval
- **THEN** that candidate remains evaluation-only and the live catalogue is unchanged

### Requirement: Incomplete or stand-in captures are refused

Ingest SHALL refuse a capture that is missing required artifacts, uses character-only usage, omits a selected worker model, names the candidate on both runs, or matches the test-repo stand-in rewrite.

#### Scenario: Character-only usage is refused
- **WHEN** ingest is given a capture whose usage is character counts rather than host tokens
- **THEN** ingest fails and writes no corpus scores

#### Scenario: A stand-in rewrite is refused
- **WHEN** ingest is given a capture whose candidate tree is the test-repo stand-in rewrite
- **THEN** ingest fails and writes no corpus scores

#### Scenario: A missing worker name is refused
- **WHEN** ingest is given a capture whose candidate result omits `selectedWorkerModel`
- **THEN** ingest fails and writes no corpus scores
