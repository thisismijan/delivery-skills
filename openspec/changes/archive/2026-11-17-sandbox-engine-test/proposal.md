## Why

The sandbox run, stop, and reap commands were tested only against a fake
engine. A change in an engine's listing format or label filter would break a
real run without failing any test.

## What Changes

- `factory/scripts/sandbox-engine.test.ts` runs only where docker or podman and
  a local busybox or alpine image are present. It starts labelled containers
  for two runs, checks the doctor listing groups them by run, reaps one run,
  and checks only that run's containers are gone. It cleans up whatever it
  started.
- Without an engine it is skipped, with the reason in its name. When
  `DELIVERY_SANDBOX_ENGINE_TEST=required` is set, a missing engine fails
  instead.
- A `sandbox-engine` CI job runs it against a Docker service with that
  variable set.
- It was proven locally against rootless podman.

Out of scope: running workers' full commands in a container, and pulling
images outside the CI job.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `worker-worktrees`: sandbox reaping is proven against a real engine.

## Impact

`factory/scripts/sandbox-engine.test.ts`, `.gitlab-ci.yml`,
`factory/scripts/ci-pipeline.test.ts`, and `docs/reference.md`.
