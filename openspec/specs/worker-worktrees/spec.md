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

### Requirement: The parallel cap counts workers already running
`config.ts ready-wave` SHALL count the workers its `dispatch.json` shows
without `finishedAt` against `maxParallelWorktrees` and SHALL dispatch only the
room left. It SHALL refuse a key that already has a running worker.

#### Scenario: Cap already reached
- **WHEN** four workers are running at a cap of four and a fifth key is ready
- **THEN** nothing is dispatched and the key stays queued

#### Scenario: Finished workers
- **WHEN** a worker has `finishedAt`
- **THEN** it does not count against the cap and is not watched for idleness

### Requirement: Auto starts no more work while the operator's queue is full
The ready wave SHALL count the ledger's open changes, every key with a change
not yet merged, including stopped and waiting ones, plus each live worker.
When that count reaches `maxAwaitingReview`, it SHALL dispatch no new work and
report that it held work for review. Auto SHALL record the hold, keep working
the open changes, and wait on a person when only held keys remain. It SHALL
NOT raise the limit itself.

#### Scenario: A full queue
- **WHEN** five changes wait for the operator and the limit is five
- **THEN** no new worker starts and the held keys stay queued

#### Scenario: Live workers
- **WHEN** three changes wait, one worker is building, and the limit is five
- **THEN** only one more worker starts

#### Scenario: An unreadable ledger
- **WHEN** the Keys table is missing or names a change it cannot read
- **THEN** the ready wave fails instead of guessing the count

### Requirement: A worker cannot make the host run code through git
A sandboxed worker SHALL see the shared git `config`, `hooks`, and `info`, its
worktree's `.git` pointer file, and its own `commondir`, `gitdir`, and
`config.worktree` read-only. Every git command the pack's scripts run on a
worker's repository or worktree SHALL disable fsmonitor and hooks on the
command line.

#### Scenario: A planted fsmonitor program or hook
- **WHEN** a worker has set `core.fsmonitor` or installed a hook and the coordinator closes its worktree
- **THEN** neither runs on the host

#### Scenario: A worker writes the shared git config
- **WHEN** a sandboxed worker tries to write `.git/config`
- **THEN** the write fails, because that path is mounted read-only

### Requirement: A redirected or self-configured worktree is not trusted
`worktree-close.ts` SHALL keep a worktree whose own `config.worktree` is not
empty, for a person to inspect. It and the sandbox plan SHALL refuse a
worktree whose git directory is outside the repository's `worktrees` folder.

#### Scenario: Its own git config
- **WHEN** a worker worktree has a non-empty `config.worktree`
- **THEN** closing keeps the worktree and says why

#### Scenario: A redirected pointer
- **WHEN** a worktree's `.git` file points outside the repository's `worktrees` folder
- **THEN** closing and sandbox planning both refuse it

### Requirement: Leftover sandbox containers are reaped per run

`sandbox-run.ts reap <repoRoot> <run-id>` SHALL remove every container labelled
with that run and SHALL NOT touch a container without that label. It SHALL
report the containers it removed and those the engine refused, and exit 1 when
any was refused. `/delivery doctor` SHALL list sandbox containers still present,
naming their runs, when a sandbox is configured and usable.

#### Scenario: Containers from a finished run are removed

- **GIVEN** containers labelled for run `run-7` and one labelled for run `run-8`
- **WHEN** `sandbox-run.ts reap` runs for `run-7`
- **THEN** both `run-7` containers are removed
- **AND** the `run-8` container remains

#### Scenario: A refused removal is reported

- **GIVEN** a container for the run that the engine refuses to remove
- **WHEN** `reap` runs
- **THEN** that container is listed as failed and the command exits 1

#### Scenario: Doctor names runs with leftovers

- **GIVEN** a usable sandbox and containers left from two runs
- **WHEN** `/delivery doctor` runs
- **THEN** it reports how many containers remain, names both runs, and names the `reap` command

### Requirement: A worker that finished but did not exit is reconciled, not stopped as idle

`worker-watch.ts` SHALL report a worker as finished when its own row in its
journal carries a status after which a worker has nothing left to do
(`[go !N]`, `[stopped: <reason>]`, or a status that follows landing), whatever
its idle time. Auto SHALL reconcile a finished worker from its journal, git,
and forge, then end it, and SHALL NOT treat it as idle or redo its work.

#### Scenario: A terminal journal past the idle limit

- **GIVEN** a worker whose journal row reads `[go !4]` and was last written 45 minutes ago
- **AND** an idle limit of 20 minutes
- **WHEN** `worker-watch.ts` runs
- **THEN** the worker is listed as finished, not idle
- **AND** the coordinator reconciles its result and ends it

#### Scenario: A worker still mid-run is unchanged

- **GIVEN** a worker whose journal row reads `[ready !6]` and was last written 45 minutes ago
- **WHEN** `worker-watch.ts` runs with a 20 minute limit
- **THEN** the worker is listed as idle

### Requirement: An idle worker's proven change is kept for review

When a worker is stopped as idle, auto SHALL check the key's open changes. When
exactly one is open and its head appears in the worker's journal or under a
passing green gate, the key SHALL record that change and resume at review on
the next run. Otherwise the key SHALL stay stopped as idle.

#### Scenario: An open draft change at a green head

- **GIVEN** an idle worker whose branch has one open draft change at a head its green gate artifact names
- **WHEN** the coordinator handles the idle report
- **THEN** the key records that change and the next run resumes at review

#### Scenario: No open change

- **GIVEN** an idle worker with no open change
- **WHEN** the coordinator handles the idle report
- **THEN** the key is `[stopped: worker idle]`

### Requirement: Sandbox reaping is proven on a real engine

Where a supported engine and a small local image are present, a test SHALL
start labelled containers for two runs, reap one run, and show that only that
run's containers are gone. Without an engine it SHALL be skipped with that
reason, unless the engine is marked required, when it SHALL fail.

#### Scenario: An engine is present

- **GIVEN** an engine and image on the machine
- **WHEN** the test runs
- **THEN** reaping one run removes only that run's containers

#### Scenario: No engine

- **GIVEN** no engine
- **WHEN** the test runs
- **THEN** it is skipped with a reason naming the missing engine
