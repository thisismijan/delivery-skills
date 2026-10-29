# worker-worktrees

## Purpose

How auto prepares, watches, and closes the isolated worktrees its parallel
workers run in, so no worker's uncommitted or unpushed work is lost.

## Requirements

### Requirement: A worker worktree is removed only when nothing would be lost
`worktree-close.ts` SHALL remove a linked worktree only when it has no
uncommitted or untracked files and its last commit is contained in a remote
branch. Otherwise it SHALL keep the worktree and report each reason. It SHALL
refuse the primary checkout and a path that is not a git worktree.

#### Scenario: Clean and pushed
- **WHEN** a linked worktree has no changes and its last commit is on a remote branch
- **THEN** the worktree is removed and the result is `removed`

#### Scenario: Uncommitted, untracked, or unpushed work
- **WHEN** a linked worktree has a modified file, an untracked file, or a commit on no remote branch
- **THEN** the worktree is kept and the result is `kept` with every reason

#### Scenario: Primary checkout or not a worktree
- **WHEN** the path is the primary checkout or not inside a git worktree
- **THEN** the command fails and removes nothing

#### Scenario: Dry run
- **WHEN** the command runs with `--dry-run` on a clean, pushed worktree
- **THEN** the result is `would-remove` and the worktree still exists

### Requirement: Auto closes every worker worktree through the close command
Auto SHALL close each worker's worktree with `worktree-close.ts` after the
worker stops, and SHALL record each kept worktree with its reason in the
ledger's Decisions.

#### Scenario: A worker stopped with unpushed work
- **WHEN** auto closes a worktree that still holds unpushed commits
- **THEN** the folder stays, and the ledger records it as kept with that reason

### Requirement: Only confirmed local files are copied into worker worktrees
Auto SHALL copy into a new worker worktree only the exact paths the operator
confirmed in `.delivery/worktree-files.json`. Each path SHALL be relative,
inside the repository, a regular file that is not a symbolic link, at most
1 MiB, ignored by git, and not tracked. Copying SHALL check every file before
writing any.

#### Scenario: Confirmed files
- **WHEN** the operator confirmed `.env` and `config/local.json` and auto creates a worktree
- **THEN** both files are copied into it and no other ignored file is

#### Scenario: No confirmed list
- **WHEN** no list was confirmed
- **THEN** nothing is copied and the worker continues with tracked files only

#### Scenario: Unsafe path
- **WHEN** the operator names a pattern, a climbing or absolute path, a tracked or unignored file, a symbolic link, a folder, or a file over 1 MiB
- **THEN** confirm refuses it and writes no list

#### Scenario: Missing or existing file at copy time
- **WHEN** a confirmed file no longer exists in the main checkout, or already exists in the worktree
- **THEN** copy fails naming the file and writes nothing, and only that key stops

#### Scenario: Wrong target
- **WHEN** copy is given the main checkout or a worktree of another repository
- **THEN** it refuses

### Requirement: Idle parallel workers are stopped from their journal heartbeat
A parallel worker SHALL write its journal at every step boundary and around
any long command. `worker-watch.ts` SHALL report a worker idle when its
journal, or its dispatch when there is no journal, is older than
`workerIdleMinutes` (default 20). Auto SHALL stop an idle worker's key,
close its worktree, ignore its later writes, and keep its siblings running.

#### Scenario: Recent heartbeat
- **WHEN** a worker's journal was written within the idle limit
- **THEN** it is reported active

#### Scenario: Silent worker
- **WHEN** a worker's journal has not changed for longer than the idle limit
- **THEN** it is reported idle, the command exits 3, and auto stops only that key as `[stopped: worker idle]`

#### Scenario: No journal yet
- **WHEN** a worker has written no journal
- **THEN** its idle time counts from its dispatch

#### Scenario: Malformed input
- **WHEN** the dispatch list is empty, names a key twice, has a malformed key or time, or the limit is not a positive whole number
- **THEN** the command fails and reports no worker as active

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
