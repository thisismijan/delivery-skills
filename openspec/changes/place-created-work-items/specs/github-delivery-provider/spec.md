## ADDED Requirements

### Requirement: Create assigns, plans, and parents the new issue

Create SHALL assign the new issue from the `assignee` setting (`me` by
default, `none`, or a login), SHALL set the open milestone named by the
`milestone` setting (none by default), and SHALL attach it as a sub-issue of
the input's `parent` issue in the same repository. It SHALL resolve every
lookup before the create request. Normalized issues SHALL report the first
assignee's login, the milestone title, and the parent.

#### Scenario: Default assignment

- **WHEN** create runs with no assignee setting
- **THEN** the issue is assigned to the token's user and the result reports that login

#### Scenario: Unknown milestone

- **WHEN** the milestone setting names no open milestone
- **THEN** the adapter fails and creates nothing

### Requirement: A replay never re-places the issue

A replay SHALL NOT reassign or re-plan the issue. It SHALL add a parent only
when the issue has none, and SHALL refuse a different parent.

#### Scenario: Replay naming another parent

- **GIVEN** the issue for an audit id is already under parent 5
- **WHEN** create is replayed naming parent 6
- **THEN** the adapter refuses it as conflicting content and writes nothing
