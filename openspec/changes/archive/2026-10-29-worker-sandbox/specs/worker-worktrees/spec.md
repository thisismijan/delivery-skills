## ADDED Requirements

### Requirement: Auto uses a confirmed worker sandbox or none
When `.delivery/sandbox.json` holds an operator-approved sandbox, auto SHALL
run every parallel worker through `sandbox-run.ts run`. When no sandbox was
confirmed, auto SHALL dispatch workers in plain worktrees. When a confirmed
sandbox cannot run, auto SHALL stop the fan-out.

#### Scenario: No sandbox confirmed
- **WHEN** `.delivery/sandbox.json` does not exist
- **THEN** `check` exits 3 and workers run in plain worktrees

#### Scenario: Confirmed sandbox cannot run
- **WHEN** the file is malformed, the engine is not on PATH, or the image is not present
- **THEN** `check` exits 1 with the reason and auto stops the fan-out instead of running workers unsandboxed

### Requirement: Only an approved, well-formed sandbox is saved
`sandbox-run.ts confirm` SHALL save a sandbox only when it carries the
operator's approval, a plain image reference, unique variable names that the
runner does not set itself, and a worker command that names the ticket.

#### Scenario: Unapproved or unsafe config
- **WHEN** a config lacks approval, lists a variable twice or one the runner sets, has an image reference with spaces, or a worker command without `{key}`
- **THEN** `confirm` refuses it and writes nothing

### Requirement: The worker container is confined and always removed
The container SHALL mount only the worktree and its git data read-write, the
state root read-only, the run's journal folder read-write, and the pack
read-only. It SHALL drop every capability, forbid privilege escalation, run
as the coordinator's user, pass only the confirmed variable names, have no
network unless the config says `open`, and be removed when the worker ends.

#### Scenario: Worktree outside the repository
- **WHEN** the path is the main checkout or a worktree of another repository
- **THEN** `run` refuses it before starting a container

#### Scenario: Worker ends
- **WHEN** setup fails, the worker fails, or the worker succeeds
- **THEN** the container is removed and the worker's commits remain in its worktree

#### Scenario: Idle sandboxed worker
- **WHEN** `worker-watch.ts` reports a sandboxed worker idle
- **THEN** `stop` removes its container, ending its processes
