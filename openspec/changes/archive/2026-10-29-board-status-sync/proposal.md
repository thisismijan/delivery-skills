## Why

Tickets stay in their first column while delivery grooms, drafts,
builds, and reviews them. The board is the team's view of progress, so
operators move every card by hand and the board drifts from the real
state of the work.

## What Changes

- Two new normalized work-item operations: `statuses` reads the board's
  ordered columns and a ticket's current column, and `transition` moves
  a ticket to a named column.
- A board map, confirmed once by the operator, links four SDLC phases
  to board columns: `ready`, `in-progress`, `in-review`, and `done`.
- `board-status.ts` proposes that map from the column names and refuses
  to guess when a name is ambiguous or the columns are out of order.
- Draft, execute, and post-merge verify move the ticket forward at their
  phase boundaries. A move never goes backwards, never closes a ticket,
  and never blocks delivery when it is skipped.
- Local files, GitLab, and Jira implement the operations. GitHub
  reports the operations as unsupported, so it has no board map and
  every move is skipped.
- The constitution moves routine forward status changes off the
  human-owned list. Closing, reopening, deleting, and backwards moves
  stay human-owned.

## Capabilities

### New Capabilities

- `board-status-sync`: board interpretation, the confirmed map, and
  forward-only phase moves.

### Modified Capabilities

- `work-item-operations`: adds `statuses` and `transition`, both bounded
  by the confirmed board map.

## Impact

- `factory/scripts/work-item-provider.ts`, `factory/scripts/board-map.ts`,
  `factory/scripts/board-status.ts`
- `providers/gitlab/gitlab-work-item.ts`, `providers/jira/jira-tracker.ts`
- `skills/delivery/sdlc-constitution.json` and `SDLC-CONSTITUTION.md`
- draft, execute, post-merge verify, and `/delivery init`
- operator docs that describe human-owned tracker status
