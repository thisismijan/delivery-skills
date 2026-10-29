## ADDED Requirements

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
