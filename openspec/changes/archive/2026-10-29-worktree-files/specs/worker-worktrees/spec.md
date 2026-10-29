## ADDED Requirements

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
