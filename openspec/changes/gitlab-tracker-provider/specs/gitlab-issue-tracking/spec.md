# Spec Delta

## Purpose

Lets a repository use GitLab issues as its confirmed work-item provider through
the portable list, read, create, link, and note operations, while one GitLab
provider selection also keeps forge and review capabilities available.

## ADDED Requirements

### Requirement: GitLab selection substantiates forge, review, and tracker capabilities
Selecting the GitLab provider SHALL advertise `forge.change`, `review.publish`,
and `tracker.item` with provider identity `gitlab` and absolute executable
invocations once the matching adapters, bun, and a credential are present.
Readiness SHALL remain false until those conditions hold, and SHALL NOT infer
work-item selection from the forge remote.

#### Scenario: Ready GitLab install
- **WHEN** both GitLab executables, bun, and a credential are present
- **THEN** the runtime overlay marks forge, review, and tracker capabilities available with `provider: "gitlab"` and `exec:` invocations

#### Scenario: Missing tracker executable
- **WHEN** the GitLab work-item executable is absent
- **THEN** GitLab readiness stays false and tracker.item remains unavailable

### Requirement: GitLab issues implement the portable work-item protocol
The GitLab work-item adapter SHALL accept one operation argument
(`list`, `read`, `create`, `link`, or `note`) and a version-1 JSON envelope on
stdin, and SHALL write normalized work items that satisfy the portable work-item
schemas to stdout.

#### Scenario: Read succeeds
- **WHEN** the adapter reads an existing GitLab issue
- **THEN** it returns one validated work item with provider `gitlab`, the issue reference, type, title, body, blocked-by references, notes, and optional source audit id

#### Scenario: List paginates
- **WHEN** GitLab returns more than one page of issues
- **THEN** the adapter returns every issue across pages and fails closed if the page limit is exceeded

### Requirement: Mutations stay approval-bounded and replay-safe
Create and link SHALL require `approved: true` before any GitLab write.
Create SHALL treat a stable audit id as idempotent: the same content returns
the existing item, and conflicting content is refused. Notes SHALL keep one
body per audit id.

#### Scenario: Unapproved create
- **WHEN** create is requested without approved input
- **THEN** the adapter refuses the operation and sends no GitLab write

#### Scenario: Create replay
- **WHEN** create is repeated with the same audit id and the same title, body, type, and blocked-by set
- **THEN** the adapter returns the existing item and does not create another issue

#### Scenario: Conflicting create replay
- **WHEN** create is repeated with an existing audit id and different content
- **THEN** the adapter refuses the operation without changing GitLab state

#### Scenario: Note replay
- **WHEN** the same audit id is posted again with a new body
- **THEN** exactly one note with that audit id remains, carrying the latest body

### Requirement: Dependency links are additive and never deleted
Link SHALL record requested `is_blocked_by` issue dependencies on the GitLab
issue. The adapter SHALL add missing links and SHALL refuse a request that
would require deleting an existing dependency.

#### Scenario: Missing blockers are added
- **WHEN** an approved link names blockers the issue does not yet have
- **THEN** the adapter creates those GitLab issue links and returns the updated item

#### Scenario: Removal is refused
- **WHEN** an approved link omits a blocker that already exists
- **THEN** the adapter refuses the operation and leaves existing links unchanged

### Requirement: Status transitions and deletes stay human-owned
The adapter SHALL NOT close, reopen, delete, or transition a GitLab issue, and
SHALL NOT delete notes or issue links.

#### Scenario: Forbidden operation
- **WHEN** a caller requests close, delete, or a status transition
- **THEN** the adapter fails before any GitLab write

### Requirement: Credentials and adapter diagnostics stay private
The adapter SHALL read credentials from `GITLAB_TOKEN`, `GL_TOKEN_FILE`, or
`~/token`, never from argv. Failures SHALL be sanitised and SHALL NOT include
credential values or raw adapter stderr in human-facing output.

#### Scenario: Missing credential
- **WHEN** no GitLab token is available
- **THEN** the adapter exits non-zero with a setup remedy that names the accepted credential sources and does not print a secret

#### Scenario: Failed GitLab call
- **WHEN** GitLab returns an error
- **THEN** the reported failure contains no token, no credentialed URL, and no GitLab response body dump

### Requirement: Compatibility wrappers are retired after generic paths use executables
The GitLab provider package SHALL install only the forge and work-item
executables. Generic skills, packaging, and doctor SHALL NOT require `gl-mr` or
`gl-note`.

#### Scenario: Provider setup
- **WHEN** GitLab setup runs
- **THEN** it installs the forge and work-item executables and does not install `gl-mr` or `gl-note`

#### Scenario: Generic packaging
- **WHEN** a generic or GitLab-selected install is verified
- **THEN** generic skills invoke forge-provider and work-item-provider commands, and `gl-mr` and `gl-note` are absent from the installed provider tools
