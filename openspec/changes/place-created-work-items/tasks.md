## 1. Core

- [x] 1.1 Add `parent` to the create input and `assignee`, `sprint`, `parent` to normalized work items
- [x] 1.2 Local files keep the parent and refuse a replay that names another one
- [x] 1.3 Create uses the executable adapter whenever one serves the selected provider

## 2. Providers

- [x] 2.1 Jira assigns, plans into a sprint, and parents in the create request
- [x] 2.2 GitLab assigns and sets a milestone
- [x] 2.3 GitHub assigns and sets a milestone

## 3. Workflow and docs

- [x] 3.1 Epic-to-backlog passes the parent and names unplaced items
- [x] 3.2 Setup asks for placement settings
- [x] 3.3 Document the settings in each provider README, `factory/WORK-ITEMS.md`, and the guides

## 4. Verify

- [x] 4.1 `bun run check` and `bun run test` pass
