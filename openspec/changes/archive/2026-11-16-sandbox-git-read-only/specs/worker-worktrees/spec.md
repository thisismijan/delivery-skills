## ADDED Requirements

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
