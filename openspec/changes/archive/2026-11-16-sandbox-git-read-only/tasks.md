## 1. Tests

- [x] 1.1 Closing a worktree never runs a planted fsmonitor program or hook (fails against plain git).
- [x] 1.2 A worktree with its own git config is kept, and one redirected outside the repository is refused.
- [x] 1.3 The sandbox plan mounts every protected git path read-only after the writable git directory, creates missing hooks, info, and config.worktree first, and refuses a redirected worktree.
- [x] 1.4 Docs contract: auto and the reference name the two git settings.

## 2. Implementation

- [x] 2.1 Add `safe-git.ts` and use it in the three scripts.
- [x] 2.2 Mount the protected git paths read-only in the sandbox plan.
- [x] 2.3 Add the fail-closed checks to `worktree-close.ts`.
- [x] 2.4 Update `auto.md` and the reference.
