## Why

Work items the delivery skill creates arrive unassigned, outside any sprint,
and detached from the epic the run started from. The operator then places
every ticket by hand before the team can plan with it.

## What Changes

- A create input may name a `parent`, and normalized work items report
  `assignee`, `sprint`, and `parent`.
- Providers place each new item from the repository's settings. `assignee`
  defaults to the user the credentials belong to. Jira's `sprint` defaults to
  the board's one active sprint once a board is recorded. GitHub and GitLab
  take a `milestone`. Jira and GitHub attach the parent; GitLab accepts it
  but does not send it, because its epics need a paid tier. Every lookup runs before the create request, and a
  replay never re-places an item.
- Create uses the provider's executable adapter whenever one is ready,
  because session tools create bare items.
- Epic-to-backlog passes the group as `parent`, shows each item's placement
  in the brief, and names any item that came back unplaced. Setup asks the
  operator for placement settings.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `work-item-operations`: create carries a parent, results report placement,
  create prefers the adapter, and the workflow reports unplaced items.
- `jira-work-items`: create assigns, plans into a sprint, and parents.
- `gitlab-issue-tracking`: create assigns and sets a milestone.
- `github-delivery-provider`: create assigns, sets a milestone, and attaches
  the parent as a sub-issue.

## Impact

`factory/scripts/work-item-provider.ts`, `factory/scripts/mcp-catalogues.ts`,
the three provider adapters and their tests, the epic-to-backlog and setup
workflows, `factory/WORK-ITEMS.md`, the provider READMEs, `README.md`, and
`docs/`.
