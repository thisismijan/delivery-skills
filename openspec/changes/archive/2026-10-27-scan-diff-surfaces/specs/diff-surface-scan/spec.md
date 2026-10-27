## ADDED Requirements

### Requirement: The scan marks surfaces from paths and changed lines

The diff scan SHALL mark Data, Contract, Config, Auth, Infra, Dependencies, and User-facing surfaces from changed paths and added or removed lines, and SHALL give the path and signal for every mark. It SHALL leave out OpenSpec, `.delivery/`, and `.review/` paths and report them.

#### Scenario: A migration marks Data
- **WHEN** the diff adds a file under a migrations directory
- **THEN** the scan marks Data with that path as evidence

#### Scenario: A lockfile marks Dependencies
- **WHEN** the diff changes `package.json`, `pyproject.toml`, or `pom.xml`
- **THEN** the scan marks Dependencies

#### Scenario: Spec artefacts mark nothing
- **WHEN** the diff only changes files under `openspec/`
- **THEN** the scan marks no surface and lists those paths as excluded

### Requirement: Destructive SQL marks a one-way door

An added line that drops a table or column, truncates a table, or deletes rows SHALL be reported as a one-way signal.

#### Scenario: A dropped column is one-way
- **WHEN** an added line contains `ALTER TABLE users DROP COLUMN email`
- **THEN** the scan reports a one-way signal for that path and line

### Requirement: The scan reports lowered quality bars

The scan SHALL report deleted test files, newly skipped tests, test files with net-removed assertions, lowered or removed thresholds, new suppressions, and new not-implemented stubs in production code, for TypeScript, Python, and Java.

#### Scenario: A skipped test is reported
- **WHEN** an added line contains `it.skip(`, `@pytest.mark.skip`, or `@Disabled`
- **THEN** the scan reports a skipped-test hit

#### Scenario: A new suppression is reported
- **WHEN** an added line contains `@ts-ignore`, `# noqa`, or `@SuppressWarnings`
- **THEN** the scan reports a suppression hit

#### Scenario: A lowered threshold is reported
- **WHEN** a removed line sets `fail_under = 90` and an added line sets `fail_under = 80`
- **THEN** the scan reports a lowered-threshold hit

#### Scenario: A reworded assertion is not a hit
- **WHEN** a test file removes one assertion line and adds one
- **THEN** the scan reports no removed-assertion hit for that file

### Requirement: The scan fails closed

The scan SHALL exit non-zero on a diff it cannot parse, and its marks SHALL be a floor that the workflow may add to but never remove.

#### Scenario: An unreadable diff stops
- **WHEN** the scan is given hunk lines with no file header
- **THEN** it exits non-zero and reports no marks
