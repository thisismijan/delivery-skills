## 1. Tests first

- [x] 1.1 Add tests in `factory/scripts/test-gate.test.ts` for empty expected paths failing closed on red and green (spec: Gates fail closed without expected tests).
- [x] 1.2 Add tests for exact path token matching: similar basename and `.bak` suffix rejected, exact path accepted, separator and `./` normalization (spec: Expected tests are proven by exact path).
- [x] 1.3 Add tests for `verifyGateEvidence`: matching accepted; commit, argv, cwd, path set, and test hash changes each rejected (spec: Gate evidence is bound to the proven state).
- [x] 1.4 Add one temp-file test that `runTestGate` records evidence with content hashes.
- [x] 1.5 Update `factory/scripts/chaos.test.ts` fixtures if the result type requires it.
- [x] 1.6 Add a documentation check that the execute and address-comments skills call the evidence verification.

## 2. Implementation

- [x] 2.1 Make `expectedTestPaths` required and non-empty in `GateCommand`, and fail closed in `evaluateGate`.
- [x] 2.2 Replace the substring check with exact normalized path token matching.
- [x] 2.3 Add the evidence record and `verifyGateEvidence`, and a CLI mode that reads the commit and hashes the test files.
- [x] 2.4 Update `skills/execute/SKILL.md` and `skills/address-comments/SKILL.md` to verify evidence before reuse.
- [x] 2.5 Run the factory test suite, lint, and typecheck.
