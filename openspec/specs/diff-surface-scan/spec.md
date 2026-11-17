# diff-surface-scan

## Purpose

Marks sensitive surfaces, one-way door signals, and lowered quality bars from a
pinned diff using paths and changed lines, so review and release readiness do
not re-read the whole diff to classify it.

## Requirements

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

### Requirement: Owner-drawn red zones force a full review

When the main checkout holds `.delivery/zones`, `diff-scan.ts` SHALL report the
changed paths in each red and yellow zone, and a change with red-zone paths
SHALL run every review lens at any level. Yellow zones SHALL only be reported.
With no map, the scan output and the fan-out SHALL be unchanged. An unreadable
map SHALL stop the scan.

#### Scenario: A diff touching a red zone is reviewed by every lens

- **GIVEN** a map marking `src/billing` red
- **WHEN** a diff touching `src/billing/rules.ts` is scanned and fanned out
- **THEN** every review lens runs

#### Scenario: No zone map

- **GIVEN** no `.delivery/zones`
- **WHEN** a diff is scanned
- **THEN** the scan output has no zones

#### Scenario: An unreadable map

- **GIVEN** a map with a line that is not `red <path>` or `yellow <path>`
- **WHEN** the scan runs
- **THEN** it exits 1 naming the line

### Requirement: Building in a red zone needs a person's approval

Before `/execute` builds a change whose planned paths reach a red zone, or
name no path while a red zone exists, it SHALL stop until an Approvals line in
a person's words names `red-zone <changeName>`. Plan approval and
`continuous-delivery: yes` SHALL NOT satisfy it. With no map, it SHALL not ask.

#### Scenario: A planned red-zone change waits

- **GIVEN** a map marking `src/billing` red and a change planning `src/billing/rules.ts`
- **WHEN** the change is checked before execute
- **THEN** it exits 3 until the ledger holds the approval line

#### Scenario: No map, no question

- **GIVEN** no `.delivery/zones`
- **WHEN** a change is checked before execute
- **THEN** it exits 0

### Requirement: The build's diff is held to the red-zone approval

After the green gate, `/execute` SHALL check the build's diff against the zone
map. It SHALL stop before the holdout review when the diff touches a red zone
and no person approved `red-zone <changeName>`. Spec and delivery files SHALL
not count.

#### Scenario: A build strays into an unplanned red zone

- **GIVEN** a change planned for `src/ui/button.ts` and a map marking `src/billing` red
- **WHEN** the build also changes `src/billing/rules.ts`
- **THEN** execute stops before the holdout review until the approval line exists

### Requirement: Doctor checks the zone map

When `.delivery/zones` exists, `/delivery doctor` SHALL report the number of
red and yellow zones, or a setup item naming the line it cannot read. Without
a map it SHALL add no check.

#### Scenario: An unreadable map

- **GIVEN** a map with an unknown zone kind on line 1
- **WHEN** doctor runs
- **THEN** it reports a setup item naming line 1
