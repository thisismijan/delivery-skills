## ADDED Requirements

### Requirement: The characterization heuristic can be measured

`characterize-measure.ts` SHALL classify each planned file of each archived
change by comparing the reference check's answer with whether the change's
surviving lines ran under test. It SHALL report false covers, needless passes,
the covered line share, and skipped files, and SHALL change no rule.

#### Scenario: A named file whose new lines never ran

- **GIVEN** an archived change that added a line to `src/fee.ts`, a test that imports `src/fee.ts`, and coverage showing that line never ran
- **WHEN** the measurement runs
- **THEN** `src/fee.ts` is reported as a false cover

#### Scenario: A file with no surviving lines

- **GIVEN** an archived change whose lines were all rewritten later
- **WHEN** the measurement runs
- **THEN** the file is counted as skipped
