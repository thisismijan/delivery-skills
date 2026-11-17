## Context

`runTestGate` spawns the command and computes `executedExpectedTests` with `output.includes(path) || output.includes(basename)`. `evaluateGate` consumes the result. Stored artifacts are named by commit but never verified.

## Approved test seams

Operator approved two pure seams in `factory/scripts/test-gate.ts`:

1. `evaluateGate(result, expect)`: pure gate evaluation, including the empty-path and exact-path-token checks.
2. `verifyGateEvidence(recorded, current)`: pure comparison of a stored evidence record with the current state.

### Controlled fakes

- Process output: `TestGateResult` literals with chosen `output`. No real test runner.
- Commit: a plain string in `current`. The pure function never calls git.
- Command: `argv` and `cwd` passed as values.
- Test file contents: content hashes passed as values; one temp-file case under the OS temp directory for an end-to-end `runTestGate` run.

### What the seams catch

- Empty `expectedTestPaths` on red and on green is rejected.
- Reuse is rejected when the commit, argv, cwd, expected path set, or any expected test file's contents differ. Each is its own case.
- Output naming `other/sample.test.ts` or `sample.test.ts.bak` does not satisfy expected `sample.test.ts`. Output with the exact path does.
- Matching evidence is accepted.

### What the seams miss

- They do not prove the runner executed the test body, only that the exact path token appears in output.
- They do not prove the skill documents call the verification. That needs a separate documentation check.
- A dirty worktree is covered only if hashes come from the working files rather than the commit.
- Runner path-shape differences stay a risk until a real runner's output is captured as a fixture.

## Decisions

- Path tokens: normalize separators to `/`, strip a leading `./`, and match the path as a whole token bounded by whitespace, quotes, or punctuation other than path characters.
- Evidence record: `{ commit, argv, cwd, expectedTestPaths (normalized, sorted), testHashes (path to sha256) }`.
- `expectedTestPaths` becomes required and non-empty in `GateCommand`.
- The CLI reads the commit with `git rev-parse HEAD` in the command's cwd and hashes the test files, then passes both into the pure functions.
- `TestGateResult` gains an optional `evidence` field so existing literals stay valid.

## Risks

- Runners print paths in different shapes, so an exact-path rule can reject a genuine run. Pin the runner output format with a fixture.
- Making `expectedTestPaths` required changes command JSON in the skills. Old artifacts with an empty list now fail closed, which is intended.
- Complexity: medium.
