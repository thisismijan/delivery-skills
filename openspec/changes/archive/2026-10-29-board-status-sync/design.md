## Context

`work-item-provider.ts` exposes list, read, create, link, and note.
Every adapter refuses a status change, and the constitution lists
`tracker-status` as human-owned. Boards differ per team: GitLab boards
are label lists, Jira boards are columns over workflow statuses, and
local files have no board at all.

## Goals / Non-Goals

**Goals:**

- Read a board's ordered columns through one normalized shape.
- Map columns to SDLC phases deterministically, with operator
  confirmation.
- Move a ticket forward at each phase boundary and skip safely
  otherwise.

**Non-Goals:**

- Closing, reopening, or deleting a ticket.
- Moving a ticket backwards, for example after a review rejection.
- Moving a ticket through session tools. Moves run only through the
  executable adapter.
- GitHub Projects support.

## Decisions

- **Normalized board.** `statuses` returns `{ version, provider, ref,
  current, statuses }`. `statuses` lists only the columns the factory can
  set, in board order. `current` is the ticket's column, or `null` when it
  sits before the first column, such as an open GitLab issue with no list
  label.
- **Four phases.** `ready` (draft finished the spec), `in-progress`
  (execute started), `in-review` (execute opened the draft change), and
  `done` (post-merge verify passed). Address-comments keeps the ticket
  in review.
- **Name rules, never guesses.** Each phase has a word pattern. A column
  that matches two phases, or a phase that matches two columns, stays
  unresolved for the operator. Mapped phases must follow board order,
  or the whole proposal is refused.
- **Confirmed map file.** `.delivery/board-status.json` records the
  provider, the exact column list, the phase map, and the operator's
  approval words. Moves are refused when the live columns differ from
  the confirmed list.
- **The boundary enforces the map.** The `transition` operation needs
  `approved: true`, a confirmed map, and a target that the map names.
  It also re-reads the ticket afterwards and fails when the ticket did
  not land in the target column.
- **Forward only.** A move is skipped when the ticket is already at or
  past the target column, or sits in a column the map does not know.
- **Skips never block.** A skip prints a reason and exits zero. A
  provider failure exits non-zero, the stage reports it in plain words,
  and delivery continues.
- **Adapters.** GitLab moves a ticket by adding the target list label
  and removing the other list labels on the same board. Jira reads the
  board named by the `board` setting and applies the workflow
  transition whose destination is the target status. Jira without a
  `board` setting refuses `statuses`, because project statuses carry no
  column order.

## Risks / Trade-offs

- A board with custom columns may map only some phases. Those phases are
  skipped, which matches today's behavior.
- A changed board stops every move until the map is confirmed again.
  That is intentional: the map no longer describes the board.
