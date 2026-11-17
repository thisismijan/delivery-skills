## ADDED Requirements

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
