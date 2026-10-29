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
