## Why

Parallel workers run in plain git worktrees with the coordinator's full
environment, home folder, and network. A worker that runs a malicious install
script, or simply goes wrong, can read every credential on the machine and
write anywhere the operator can. An idle worker can only be cancelled if the
runtime supports it, so a hung process can keep running.

## What Changes

- New optional `.delivery/sandbox.json`, saved by `/delivery init` only when
  the operator approves it. It names the engine (`docker` or `podman`), a
  local image, network `none` or `open`, the variable names to pass through,
  setup commands, and the headless worker command.
- New `factory/scripts/sandbox-run.ts` with `confirm`, `check`, `run`, and
  `stop`.
  - `check` exits 0 when the engine and image are present, 3 when no sandbox
    was confirmed, and 1 when a confirmed sandbox cannot run.
  - `run` starts one container per worker. It mounts only the worktree and its
    git data read-write, the state root read-only, the run's journal folder,
    and the pack read-only. It drops every capability, forbids privilege
    escalation, runs as the coordinator's user, and passes only the confirmed
    variable names. Setup runs inside the container before the worker, and the
    container is always removed afterwards.
  - `stop` removes the container, which ends an idle worker's processes.
- Auto checks the sandbox before the first batch. With none confirmed it
  dispatches workers as before. With one confirmed it runs every worker in it,
  and when that sandbox cannot run it stops the fan-out rather than running
  workers unsandboxed.
- Doctor reports the sandbox state. It is never a required check.
- Network access limited to listed hosts is not supported; `open` is the only
  option for a worker that needs a model or forge API.
- The planned `agent.sandbox` runtime capability is not added. Readiness comes
  from the confirmed file and the engine check, so a second switch in the
  manifest could only disagree with them.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `worker-worktrees`: workers can run in an operator-confirmed container.

## Impact

- New `factory/scripts/sandbox-run.ts` and its test; `factory/scripts/doctor.ts`
- `skills/delivery/SKILL.md`, `skills/delivery/workflows/auto.md`, `docs/reference.md`
