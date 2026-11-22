# test-gate

## Purpose

Binds red and green test gates to expected proven test paths and fails closed when that evidence is missing.

## Requirements

### Requirement: Gates fail closed without expected tests
A red or green gate SHALL fail when no expected test paths are given.

#### Scenario: No expected paths on a red gate
- **WHEN** a red gate is evaluated with an empty expected test path list
- **THEN** the gate does not pass and the reason says no expected tests were given

#### Scenario: No expected paths on a green gate
- **WHEN** a green gate is evaluated with an empty expected test path list
- **THEN** the gate does not pass and the reason says no expected tests were given

### Requirement: Expected tests are proven by exact path
A gate SHALL treat an expected test as run only when its normalized path appears as an exact path token in the command output.

#### Scenario: Similar basename does not prove the test ran
- **WHEN** the output mentions `other/sample.test.ts` or `sample.test.ts.bak` and the expected test is `sample.test.ts`
- **THEN** the gate does not pass

#### Scenario: Exact path proves the test ran
- **WHEN** the output names the expected path exactly
- **THEN** the gate treats the expected test as run

### Requirement: Gate evidence is bound to the proven state
Each gate result SHALL carry evidence of the commit, argv, cwd, normalized expected test paths, and a content hash for each expected test file. Reusing that evidence SHALL be rejected when any of them no longer matches the current state.

#### Scenario: Matching evidence is accepted
- **WHEN** the recorded evidence equals the current commit, argv, cwd, expected paths, and test hashes
- **THEN** reuse is accepted

#### Scenario: Code changed after the gate
- **WHEN** the current commit differs from the recorded commit
- **THEN** reuse is rejected

#### Scenario: Command changed after the gate
- **WHEN** the current argv or cwd differs from the recorded one
- **THEN** reuse is rejected

#### Scenario: Test contents changed after the gate
- **WHEN** an expected test file's current hash differs from the recorded hash, or the expected path set differs
- **THEN** reuse is rejected

### Requirement: Untested behaviour is pinned before it changes

Before writing a change's tests, `/execute` SHALL list the existing source
files the plan names that no test references. When there are any, the test
writer SHALL first write tests that pin their current behaviour. Those tests
SHALL pass on the current code and be committed before the change's tests.
When every planned file is already referenced, no characterization pass SHALL
run.

#### Scenario: A change to a file no test references

- **GIVEN** a change whose plan names `src/ui/button.ts`, which no test references
- **WHEN** `/execute` writes tests
- **THEN** characterization tests of its current behaviour pass the green gate and are committed first

#### Scenario: Behaviour already covered

- **GIVEN** a change whose plan names only files a test references
- **WHEN** tests are written
- **THEN** no characterization pass runs

#### Scenario: New files only

- **GIVEN** a change whose plan names a file that does not exist yet
- **WHEN** the check runs
- **THEN** that file is not listed

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

### Requirement: Yellow-zone files get a characterization pass

When the main checkout holds `.delivery/zones`, the characterization check
SHALL list each referenced planned file in a yellow zone as pinned with the
reason `yellow zone`, and SHALL exit 3. `/execute` SHALL pin it before the
change's tests. Without a map, the check SHALL be unchanged.

#### Scenario: A referenced file in a yellow zone

- **GIVEN** a planned file in a yellow zone that a test references
- **WHEN** the check runs
- **THEN** the file is listed with the reason `yellow zone` and the command exits 3

#### Scenario: No zone map

- **GIVEN** no zone map
- **WHEN** the check runs
- **THEN** the result is unchanged

### Requirement: A gate can keep its full report in a file

With `--out <report.json>`, the test gate SHALL write the same full report it
prints without the flag to that file, and SHALL print only a summary: the
report path, the verdict, the exit code, the output length, and an excerpt of
the failure lines and the end of the run. Its exit code SHALL be unchanged.

#### Scenario: Red gate with --out

- **WHEN** a red gate runs with `--out`
- **THEN** the file holds the full report with its evidence and output, and the printed summary holds no full output
