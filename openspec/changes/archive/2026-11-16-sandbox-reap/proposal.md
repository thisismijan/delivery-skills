## Why

A coordinator that dies mid-run leaves its sandboxed workers' containers
running. Each container is already labelled with its run and key, but nothing
read those labels, so the leftovers were found only by hand and removed one
key at a time with `stop`.

## What Changes

- `sandbox-run.ts reap <repoRoot> <run-id>` lists every container labelled
  with that run and removes each one, reporting what it removed and what the
  engine refused. It exits 1 when any removal failed. Containers without the
  run's label are never touched.
- `/delivery doctor` lists sandbox containers still present when a sandbox is
  configured and usable, names the runs they belong to, and points at `reap`.

Out of scope: unlabelled containers, automatic reaping, and cleaning up
worktrees or branches.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `worker-worktrees`: leftover sandbox containers are reported and can be
  removed per run.

## Impact

`factory/scripts/sandbox-run.ts`, `factory/scripts/doctor.ts`, a new test file,
and the worker sandbox section of `docs/reference.md`.
