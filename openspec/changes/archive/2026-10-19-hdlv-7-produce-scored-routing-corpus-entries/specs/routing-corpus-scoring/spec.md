## ADDED Requirements

### Requirement: Scoring records utility and critical misses per exact candidate and task class

The scoring function SHALL take a routing observation and a candidate result and return a corpus entry whose evaluation holds the candidate model, relative utility between 0 and 1, a non-negative integer count of critical misses, and the task class (the observation's work type). It SHALL NOT merge scores for different candidates or task classes.

#### Scenario: Score is recorded for the exact candidate and task class
- **WHEN** an observation and a candidate result are scored
- **THEN** the corpus entry's evaluation holds that candidate model, its relative utility and critical misses, and the observation's work type as task class

#### Scenario: Two candidates on one observation stay distinct
- **WHEN** the same observation is scored for two different candidate models
- **THEN** each result carries its own candidate model and its own utility and critical misses

#### Scenario: Out-of-range scores are refused
- **WHEN** a candidate result has utility outside 0 to 1, or a negative or fractional critical-miss count
- **THEN** scoring fails and no entry is produced

#### Scenario: Older entries without a task class still read
- **WHEN** a stored corpus entry has an evaluation with no task class
- **THEN** it parses successfully

### Requirement: Promotion report separates live and synthetic evidence

The promotion report builder SHALL group scored corpus entries by exact candidate, task class and recorded evidence source, and SHALL report `live` and `representative-run` evidence separately. It MUST NOT pool them in any count or average, and MUST NOT infer the source.

#### Scenario: Live and representative evidence are reported separately
- **WHEN** a report is built from entries with source live and entries with source representative-run for the same candidate and task class
- **THEN** each source has its own group with its own counts, utility and critical misses

#### Scenario: Entries without a score are not counted as evidence
- **WHEN** a corpus entry has no evaluation
- **THEN** it contributes to no group in the promotion report

#### Scenario: Different candidates and task classes are not combined
- **WHEN** entries differ by candidate model or by task class
- **THEN** they appear in separate groups

### Requirement: Routing persistence never defaults an outcome to success

Routing persistence SHALL require an explicit outcome validated against the outcome schema. When outcome evidence is missing or invalid, persistence SHALL fail and write nothing. This holds for the library functions and for the `record-routing persist` command, which SHALL exit nonzero without an outcome.

#### Scenario: Missing outcome is refused
- **WHEN** an observation is persisted with no outcome
- **THEN** persistence fails and no observation file is written

#### Scenario: Command line without an outcome file fails
- **WHEN** `record-routing persist` is run without an outcome file
- **THEN** it exits nonzero and writes nothing

#### Scenario: Invalid outcome is refused
- **WHEN** the supplied outcome does not satisfy the outcome schema
- **THEN** persistence fails and no observation file is written

#### Scenario: Explicit valid outcome is persisted unchanged
- **WHEN** an explicit valid outcome, including a failing one, is persisted
- **THEN** the stored observation carries that outcome exactly as given
