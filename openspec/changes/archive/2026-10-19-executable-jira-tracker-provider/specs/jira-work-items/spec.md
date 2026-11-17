# Spec Delta

## Purpose

Provides an executable Jira Cloud work-item adapter that implements the
portable tracker operations without embedding Jira details in generic delivery
core.

## ADDED Requirements

### Requirement: Adapter speaks the portable work-item protocol
The Jira adapter SHALL accept one of list, read, create, link, or note as its
only argument and a version-1 JSON envelope on stdin, and SHALL write
normalized work-item JSON on stdout. It SHALL NOT invoke a shell to talk to
Jira.

#### Scenario: Successful read
- **WHEN** the adapter receives `read` and a valid envelope for an existing issue
- **THEN** it prints one version-1 work item with provider `jira` and no Jira-only fields

#### Scenario: Successful list
- **WHEN** the adapter receives `list` and a valid empty input object
- **THEN** it prints a JSON array of normalized work items for the configured project

#### Scenario: Unknown operation
- **WHEN** the adapter receives a status-transition, delete, or other unsupported operation
- **THEN** it exits non-zero without calling Jira and reports that those actions stay human-owned

### Requirement: Configuration and credentials stay off argv
The adapter SHALL resolve Jira Cloud site, project, and credentials from
environment variables or a credential file, and SHALL NOT accept them as
command arguments. Failures SHALL be sanitised so secrets never appear on
stdout or stderr.

#### Scenario: Ready configuration
- **WHEN** site, project, email, and token are present in the environment
- **THEN** the adapter uses them for HTTPS requests without placing them in argv or request URLs

#### Scenario: Token file
- **WHEN** environment token values are absent and a configured token file exists
- **THEN** the adapter reads credentials from that file

#### Scenario: Authentication failure
- **WHEN** Jira returns 401 or 403
- **THEN** the adapter exits non-zero with a sanitised authentication failure and no credential value

### Requirement: Create and link require approval and stay idempotent
Create and dependency-link SHALL require `approved: true` before any Jira
write. Create SHALL reuse an existing issue identified by the same audit id
when content matches, and SHALL refuse a conflicting replay. Link SHALL make
the issue's blocked-by dependencies match the requested references.

#### Scenario: Unapproved create
- **WHEN** create is requested without approved input
- **THEN** the adapter refuses the operation before any Jira request

#### Scenario: Replay with the same audit id
- **WHEN** create is requested with an audit id that already identifies matching issue content
- **THEN** the adapter returns that issue and does not create a duplicate

#### Scenario: Replay with conflicting content
- **WHEN** create is requested with an audit id that already identifies different title, body, type, or blockers
- **THEN** the adapter fails closed without creating another issue

#### Scenario: Approved dependency link
- **WHEN** link is requested with approved input and a blocked-by set
- **THEN** the adapter adds missing blocker links, removes extra blocker links of that type, and leaves other link types unchanged

### Requirement: Audit notes are idempotent
Note SHALL attach at most one comment per audit id on an issue. A repeated
note with the same body SHALL make no additional comment. A repeated note with
a different body SHALL update the existing comment instead of adding another.

#### Scenario: First note
- **WHEN** note is requested with a new audit id
- **THEN** the adapter adds one comment tagged with that audit id

#### Scenario: Repeated identical note
- **WHEN** the same audit id and body are submitted again
- **THEN** the issue still has exactly one note for that audit id

#### Scenario: Updated note body
- **WHEN** the same audit id is submitted with a different body
- **THEN** the existing comment is updated and no second comment is created

### Requirement: Readiness advertises a working executable
Provider setup SHALL install the adapter executable. Readiness SHALL advertise
an available `tracker.item` capability with provider `jira` and an absolute
`exec:` invocation only when the executable, bun, site, project, and
credentials are present. Missing setup SHALL stay unavailable with secret-safe
remedies.

#### Scenario: Complete setup
- **WHEN** the Jira provider is installed and site, project, bun, and credentials are present
- **THEN** runtime capability `tracker.item` is available with provider `jira` and `exec:` plus an absolute path

#### Scenario: Incomplete setup
- **WHEN** the executable, bun, site, project, or credentials are missing
- **THEN** `tracker.item` stays unavailable and reasons name the missing setup without credential values
