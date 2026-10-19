# Proposal

## Why

Delivery already has a normalized work-item operation boundary, but the
packaged Jira tracker remains a stub. Selecting Jira still reports a missing
host probe instead of executing list, read, create, link, and note against
Jira Cloud.

## What Changes

- Ship a self-contained Jira Cloud adapter that implements the version-1
  executable work-item protocol for list, read, create, link, and note.
- Resolve Cloud site, project, and credentials from environment or a token
  file, never from argv.
- Require approved input for create and dependency-link mutations, keep audit
  notes idempotent, and refuse status transitions and issue deletion.
- Probe and advertise `tracker.item` with `provider: "jira"` and an
  `exec:` invocation once setup, bun, site, project, and credentials are
  present.
- Add fixture-backed adapter tests with injected HTTP and no live network.

## Capabilities

### New Capabilities

- `jira-work-items`: Executable Jira Cloud work-item operations behind the
  portable tracker contract, including configuration, idempotency, dependency
  links, audit notes, and human-owned status boundaries.

### Modified Capabilities

None.

## Impact

The Jira provider package, provider readiness/runtime overlay, installer
contract tests, and factory adapter tests change. Generic skills, schemas, and
vendor-neutral core language stay unchanged. No new runtime dependency is
required.
