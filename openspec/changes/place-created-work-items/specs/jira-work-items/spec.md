## ADDED Requirements

### Requirement: Create assigns, plans, and parents the new issue

Create SHALL assign the new issue from the `assignee` setting (`me` by
default, `none`, or an account id), SHALL plan it into a sprint from the
`sprint` setting (`active` by default when a board is recorded, otherwise
`none`; also `next` or a sprint id), and SHALL set the input's `parent`, all
in the create request. It SHALL resolve every lookup before the create
request. A replay that reuses an issue SHALL NOT reassign or re-plan it, and a
replay naming a different parent SHALL be refused.

#### Scenario: Default placement with a board

- **GIVEN** the repository records a board with exactly one active sprint
- **WHEN** create runs with a parent
- **THEN** the issue is created assigned to the credentials' account, in that sprint, under that parent, and the result reports all three

#### Scenario: Ambiguous or missing sprint

- **GIVEN** the board has no active sprint, or more than one
- **WHEN** create runs with the default sprint setting
- **THEN** the adapter fails, naming the board's sprints when there are several, and creates nothing

#### Scenario: Unknown assignee

- **WHEN** the assignee setting names an account Jira does not have
- **THEN** the adapter fails and creates nothing

#### Scenario: Replay

- **WHEN** create is replayed with an audit id that already identifies the issue
- **THEN** the adapter returns it without looking up or changing its assignee or sprint
