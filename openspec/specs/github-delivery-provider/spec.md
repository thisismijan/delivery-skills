# github-delivery-provider

## Purpose

Provides a combined GitHub provider that inspects pull requests, publishes
review notes, and manages issue work items through the existing forge and
tracker protocols without changing generic workflow commands.

## Requirements

### Requirement: One install selection substantiates GitHub capabilities
Selecting the GitHub provider SHALL advertise `forge.change`, `review.publish`,
and `tracker.item` with provider identity `github` and absolute executable
invocations when the adapters, runtime, and a credential are present.

#### Scenario: GitHub provider is selected and ready
- **WHEN** install selects the GitHub provider and the forge adapter, tracker adapter, Bun, and a credential are present
- **THEN** the runtime advertises all three capabilities as available with `provider: "github"` and `exec:` absolute paths

#### Scenario: GitHub setup is incomplete
- **WHEN** an advertised GitHub executable or credential is missing
- **THEN** the matching capability stays unavailable and readiness names the missing setup without printing the credential

### Requirement: Provider manifests may advertise multiple capabilities
A version-1 provider manifest SHALL be allowed to advertise every capability it
can substantiate, and existing single-kind manifests SHALL keep their previous
readiness behavior.

#### Scenario: Combined provider advertises three capabilities
- **WHEN** a provider manifest lists forge, review, and tracker capabilities
- **THEN** readiness probes each advertised capability independently and overlays only those that pass

#### Scenario: Existing forge-only provider remains valid
- **WHEN** a forge-only provider omits a capabilities list
- **THEN** it still advertises change inspection and review publication and does not claim work-item operations

### Requirement: GitHub adapters use the existing executable protocol
GitHub adapters SHALL accept one operation argument and a version-1 JSON
request on stdin, return version-1 JSON on stdout, and SHALL NOT invoke a
shell or place credentials on argv.

#### Scenario: Forge operation succeeds
- **WHEN** the GitHub forge adapter receives a valid find, read, pipeline, files, diff, commits, discussions, anchors, create, set-draft, note, or reply request
- **THEN** it returns a result that satisfies the existing forge operation schema for that operation

#### Scenario: Tracker operation succeeds
- **WHEN** the GitHub tracker adapter receives a valid list, read, create, link, or note request
- **THEN** it returns a result that satisfies the existing work-item schema

#### Scenario: Human-owned operations are refused
- **WHEN** a caller requests merge, close, approve, resolve, status change, or delete
- **THEN** the adapter refuses before any GitHub mutation and leaves the action to a human

### Requirement: Credentials and repository identity stay off argv
GitHub adapters SHALL read a token from `GITHUB_TOKEN`, `GH_TOKEN`, or a token
file, never from argv, and SHALL derive owner and repository from origin with
explicit host or repository overrides.

#### Scenario: Token comes from the environment
- **WHEN** `GITHUB_TOKEN` or `GH_TOKEN` is set
- **THEN** GitHub requests use that token in headers and never embed it in the URL, argv, or sanitized errors

#### Scenario: Repository comes from origin
- **WHEN** no explicit repository override is set
- **THEN** the adapter parses owner and repository from the git origin URL without retaining origin credentials

#### Scenario: Explicit overrides win
- **WHEN** an operator sets an explicit host or repository override
- **THEN** the adapter uses those values instead of origin

### Requirement: Pull request evidence is complete and normalized
GitHub pull-request reads SHALL paginate listings, bind evidence to the
requested change and head revision, map draft state and pipeline or
mergeability gaps explicitly, and refuse truncated diffs.

#### Scenario: Review evidence is bound to the head revision
- **WHEN** a caller requests files, diff, commits, discussions, or anchors for a pull request
- **THEN** each result includes the requested ref and head revision and contains no GitHub-native product fields

#### Scenario: Pipeline evidence is bound to an exact revision
- **WHEN** a caller requests pipeline evidence for a head or merged revision
- **THEN** the adapter queries statuses and checks for that revision and returns no evidence for another commit

#### Scenario: Diff is truncated
- **WHEN** GitHub omits a needed patch or reports fewer files than the change contains
- **THEN** the adapter refuses the files and diff operations instead of returning partial review evidence

#### Scenario: Discussions map review threads safely
- **WHEN** a pull request has issue comments and inline review threads
- **THEN** the adapter groups review comments by thread, preserves anchors on inline notes, and does not treat approval or resolution as discussion state it can mutate

### Requirement: Approved GitHub mutations stay inside existing boundaries
Draft pull-request creation, draft-state changes, notes, and thread replies
SHALL require approved input, and note bodies SHALL be supplied by the core
after local publication checks.

#### Scenario: Unapproved forge mutation
- **WHEN** a caller requests create, set-draft, note, or reply without `approved: true`
- **THEN** the adapter does not call GitHub

#### Scenario: Inline note uses a valid added line
- **WHEN** an approved note includes an anchor that is an added line in the complete diff
- **THEN** the adapter posts an inline review comment on that path and line

#### Scenario: Reply stays on a review thread
- **WHEN** an approved reply names a review-thread discussion id
- **THEN** the adapter posts a thread reply and returns a receipt with note and discussion ids

### Requirement: GitHub issues implement tracker operations without lifecycle mutation
GitHub issue create, link, and note operations SHALL be idempotent by audit id,
record dependency links, and SHALL NOT change issue status or delete issues or
dependency links.

#### Scenario: Create is replayed with the same audit id
- **WHEN** an approved create repeats an audit id with the same title, body, type, and blocked-by set
- **THEN** the adapter returns the existing issue and does not create a second item

#### Scenario: Create replay conflicts
- **WHEN** an approved create repeats an audit id with different content
- **THEN** the adapter refuses and leaves the existing issue unchanged

#### Scenario: Dependency links are additive
- **WHEN** an approved link names blocked-by references that are not already recorded
- **THEN** the adapter adds those links and does not close, delete, or unlink issues

#### Scenario: Audit note is repeated
- **WHEN** the same issue note audit id is submitted again
- **THEN** exactly one note with that audit id remains on the item
