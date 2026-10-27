## MODIFIED Requirements

### Requirement: Captured model-run trees can be scored as graduation evidence

A complete paired capture of a baseline worker and an exact fast catalogue candidate SHALL be scored with provenance `model-run` and source representative-run. Ingest SHALL require that candidate id to appear in the fast catalogue tier. Scoring SHALL NOT change live catalogue availability.

#### Scenario: A complete capture is scored as a model run
- **WHEN** ingest is given a complete paired capture for an unscripted fixture and an exact fast catalogue candidate
- **THEN** the corpus entry uses provenance `model-run` and names that candidate

#### Scenario: Model-run scores still do not promote without approval
- **WHEN** five or more ingested `model-run` scores for an exact fast catalogue candidate clear the 90 percent bar with no critical misses and there is no operator promotion approval
- **THEN** that candidate remains evaluation-only and the live catalogue is unchanged

#### Scenario: A non-fast model is refused
- **WHEN** ingest is asked to score a model that is not in the fast catalogue tier
- **THEN** ingest fails and writes no corpus scores
