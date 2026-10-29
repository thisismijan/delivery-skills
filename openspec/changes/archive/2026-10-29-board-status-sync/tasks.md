## 1. Tests

- [x] 1.1 Prove board interpretation maps a standard board, leaves ambiguous columns, and refuses out-of-order columns.
- [x] 1.2 Prove confirm refuses a map without approval and sync skips when the board changed or no map exists.
- [x] 1.3 Prove sync moves forward, never backwards, and skips unknown columns, end to end on local files.
- [x] 1.4 Prove the transition operation refuses unapproved input and targets outside the map.
- [x] 1.5 Prove GitLab and Jira read ordered columns and move tickets, and still refuse close and delete.
- [x] 1.6 Prove draft, execute, and post-merge verify name their sync calls, and the constitution keeps closing human-owned.

## 2. Implementation

- [x] 2.1 Add `statuses` and `transition` to `work-item-provider.ts`, with the local-files implementation.
- [x] 2.2 Add `board-map.ts` and `board-status.ts` with propose, confirm, and sync.
- [x] 2.3 Implement the operations in the GitLab and Jira adapters.
- [x] 2.4 Update the constitution, the stages, `/delivery init`, and operator docs.
