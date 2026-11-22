## ADDED Requirements

### Requirement: A gate can keep its full report in a file

With `--out <report.json>`, the test gate SHALL write the same full report it
prints without the flag to that file, and SHALL print only a summary: the
report path, the verdict, the exit code, the output length, and an excerpt of
the failure lines and the end of the run. Its exit code SHALL be unchanged.

#### Scenario: Red gate with --out

- **WHEN** a red gate runs with `--out`
- **THEN** the file holds the full report with its evidence and output, and the printed summary holds no full output
