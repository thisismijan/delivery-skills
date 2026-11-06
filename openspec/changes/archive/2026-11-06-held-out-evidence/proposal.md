## Why

A rule written from sample data always fits the samples it came from, so a
test on those samples alone proves little. The CI failure classifier showed
it. It matched all 13 jobs it was written from. On 68 later jobs, labelled from
their logs before it ran, it matched 45. On a second fresh batch it matched 22
of 49. Every miss failed safe, sending the job to the operator instead of
retrying it. But one pattern also read a job id followed by "failed" as a test
runner's failure count, and most other misses were wordings it had never seen.
Nothing in the skills asked for a held-out check on such rules.

## What Changes

- `/draft`: when an acceptance criterion is met by a rule written from samples,
  real samples are set aside before anything is built. Each is labelled from
  its source, never by running code, and kept under
  `.review/<changeName>/held-out-samples/`, outside the spec.
- `/execute`: after the green gate, the test writer adds one test file that
  runs the rule over those samples and keeps each miss as a recorded miss. The
  result goes to the holdout review. A miss is never sent to the implementer,
  because fixing against held-out samples makes them samples the rule was
  written from.
- The implementer never reads the held-out samples. The holdout reviewer fails
  a rule tested only on its own samples unless a held-out result exists or
  `design.md` says none could be set aside.
- The classifier: the failure-count pattern no longer matches an id, and an
  upstream 50x, TLS connect reset, proxy abort, or connection reset is
  infrastructure. A new fixture holds three anonymised labelled sets: two the
  rules were fixed against, and one held out from every fix. On the held-out
  set it matches 49 of 50. The one miss (`curl: (16)`) is recorded and left
  unfixed, so that number stays a real measurement.

## Capabilities

### New Capabilities

- `held-out-evidence`: rules written from samples are measured on samples
  they were not written from.

### Modified Capabilities

- `forge-operations`: the failure classifier's held-out measurement.

## Impact

- `skills/draft/SKILL.md`, `skills/execute/SKILL.md`
- `factory/agents/implementer.md`, `implementer-opus.md`, `test-writer.md`,
  `holdout-reviewer.md`
- `factory/scripts/ci-failure.ts`, new fixture
  `factory/scripts/fixtures/ci-failures-held-out.json`
- `docs/reference.md`
