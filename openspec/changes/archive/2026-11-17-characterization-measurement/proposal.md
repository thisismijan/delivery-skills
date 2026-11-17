## Why

The characterization pass decides "covered" from whether a test names a file.
How often that misses untested code, or runs a pass the tests did not need,
was unknown, and the operator wants that number before deciding whether
yellow zones should trigger the pass.

## What Changes

- `characterize-measure.ts <repoRoot> <lcov.info>` runs the reference check
  over every archived change. For each planned file it uses `git blame` to
  find the lines that change wrote and that survive today, and compares them
  with line coverage from an lcov report. It reports:
  - false covers: called covered, but none of those lines ran;
  - needless passes: called uncovered, but some lines ran;
  - the share of changed lines that ran in files called covered;
  - files skipped because no lines survive.
- It changes no rule. The results go to standard output rather than the
  evaluation corpus, whose schema is for routing evidence.

Out of scope: changing the reference heuristic, and measuring other
repositories.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `test-gate`: the characterization heuristic can be measured against line
  coverage.

## Impact

`factory/scripts/characterize-measure.ts`, its tests, and the characterization
section of `docs/reference.md`.
