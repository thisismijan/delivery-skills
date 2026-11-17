## ADDED Requirements

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
