## Why

In one delivery run, runner and registry failures went to the operator one at
a time: seven times across five changes, plus more later from registry fetch
failures, a certificate failure fetching a dependency, and a registry 503.
On one change a test failure was retried as if it were infrastructure. The
skill had no retry operation, the pipeline data had no job failure reason, and
the run contract had no field for a retry policy, so every one of them needed
a person.

## What Changes

- A new `failures` forge operation returns the failed jobs of the newest
  pipeline at the change's head, each with its forge failure reason, how many
  times it has run, and the end of its log. A train pipeline also says how many
  train pipelines in a row have failed for the head.
- A new classifier names a failed job infrastructure, test, or unknown. A
  forge-reported runner, API, or image-pull reason wins. Then a failing test
  in the log, then a known infrastructure pattern in the log (registry rate
  limit or refusal, certificate failure, upstream 50x, network failure, full
  disk), then a test job's name. Anything else is unknown.
- A new gated `retry` forge operation reruns a failed pipeline once. It reads
  `failures` itself and retries only when the run contract allows it, every
  failed job is infrastructure, none is a deploy job, and none has run twice.
  A failed merge train is re-added to the train, because train jobs cannot be
  retried. It runs only through the executable adapter.
- The run contract gains an optional `ciRetry: { infrastructure: 0 | 1 }`.
  Absent means no retry. The operator is asked once, when the plan is approved.
- The GitLab adapter implements both. The GitHub adapter does not yet, so a
  run there stops for the operator as before.
- `pipeline-monitoring.md` tries the retry before failure diagnosis, and its
  escalation and stop table no longer say there is no retry operation.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `forge-operations`: failed-job evidence and a gated retry.

## Impact

- `factory/scripts/forge-provider.ts`, new `ci-failure.ts` and
  `retry-gate.ts`, `sdlc-constitution.ts`, `pipeline-route.ts`
- `providers/gitlab/gitlab-forge.ts`, `providers/gitlab/gitlab-host.ts`
- `skills/delivery/workflows/pipeline-monitoring.md`, `auto.md`
- `factory/RUNTIME.md`, `README.md`, `docs/reference.md`, `docs/extending.md`,
  both provider READMEs
- New fixture `factory/scripts/fixtures/ci-failures.json`: 13 real failed
  jobs, anonymised
