## ADDED Requirements

### Requirement: Create assigns the new issue and sets its milestone

Create SHALL assign the new issue from the `assignee` setting (`me` by
default, `none`, or a login) and SHALL set the open milestone named by the
`milestone` setting (none by default). It SHALL resolve both before the create
request. A replay that reuses an issue SHALL NOT reassign it or change its
milestone. Normalized issues SHALL report the first assignee's login and the
milestone title.

#### Scenario: Default assignment

- **WHEN** create runs with no assignee setting
- **THEN** the issue is assigned to the token's user and the result reports that login

#### Scenario: Unknown milestone

- **WHEN** the milestone setting names no open milestone
- **THEN** the adapter fails and creates nothing
