## ADDED Requirements

### Requirement: Created work items are placed and report their placement

A create input SHALL accept an optional `parent` reference. A normalized work
item SHALL report `assignee`, `sprint`, and `parent` when the provider knows
them, and SHALL omit each one the item was not placed by. Local files SHALL
record the parent. Create SHALL use the selected provider's executable adapter
whenever one is ready, even when session tools map create, because session
tools create bare items.

#### Scenario: Local item under a group

- **WHEN** a local-files create names a parent
- **THEN** the stored item reports that parent, a replay without a parent returns it, and a replay naming another parent is refused as conflicting content

#### Scenario: Adapter and session tools both available

- **GIVEN** the selected provider has a ready executable adapter and recorded session tools that map create
- **WHEN** a create is planned or run
- **THEN** it goes through the adapter, while reads still go through the session tools

#### Scenario: No adapter

- **GIVEN** only session tools serve the selected provider
- **WHEN** a create is planned
- **THEN** it goes through the session tools and passes the parent

### Requirement: Epic-to-backlog reports where each created item landed

When the run started from a work-item group, epic-to-backlog SHALL pass that
group as each item's `parent`. Its brief SHALL show each created item's
assignee, sprint, and parent, and SHALL name every item that came back without
the requested parent, without an assignee while assignment is on, or without a
sprint while the repository records a board, sprint, or milestone. It SHALL
NOT edit an item to place it.

#### Scenario: Unplaced item

- **GIVEN** a created item comes back with no sprint while the repository records a board
- **WHEN** the brief is shown
- **THEN** it names that item so the operator can place it, and nothing edits the item

### Requirement: Setup asks where created items land

Setup SHALL show the operator the provider's placement settings and SHALL
record only the values the operator chooses. It SHALL NOT pick a placement
setting for them.

#### Scenario: Operator keeps the defaults

- **WHEN** the operator keeps the default placement
- **THEN** setup records no placement setting
