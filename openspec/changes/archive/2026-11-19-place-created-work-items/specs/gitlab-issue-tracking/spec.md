## ADDED Requirements

### Requirement: Create assigns the new issue and sets its milestone

Create SHALL assign the new issue from the `assignee` setting (`me` by
default, `none`, or a username) and SHALL set the milestone named by the
`milestone` setting (none by default). It SHALL resolve both before the create
request. It SHALL accept a `parent` without sending it, and SHALL NOT report
one. A replay that reuses an issue SHALL NOT reassign it or change its
milestone. Normalized issues SHALL report the first assignee's username and
the milestone title.

#### Scenario: Default assignment

- **WHEN** create runs with no assignee setting
- **THEN** the issue is assigned to the token's user and the result reports that username

#### Scenario: Unknown milestone

- **WHEN** the milestone setting names no single active milestone
- **THEN** the adapter fails and creates nothing
