# Proposal

## Why

Delivery already has provider-neutral forge and work-item protocols, but the
only live remote adapter is GitLab merge requests. A GitHub repository cannot
substantiate change inspection, review publication, or issue work items without
embedding product-specific commands in generic skills.

## What Changes

- Add one installable GitHub provider bundle that substantiates `forge.change`,
  `review.publish`, and `tracker.item` from a single `--provider github`
  selection.
- Implement GitHub REST adapters that speak the existing forge and work-item
  executable protocols exactly, sharing credential and repository discovery.
- Keep note-body safety in the core, require approved mutations, paginate
  listings, and refuse truncated diffs instead of reviewing partial evidence.
- Map pull-request review comments and thread replies onto normalized
  discussions without exposing merge, close, approve, resolve, status change,
  or delete operations.
- Evolve provider packaging so a manifest may advertise multiple capabilities
  without breaking existing single-kind providers.

## Capabilities

### New Capabilities

- `github-delivery-provider`: GitHub REST adapters for pull-request change
  inspection, review publication, and issue work items behind the existing
  forge and tracker protocols.

### Modified Capabilities

None.

## Impact

This adds `providers/github/`, fixture-backed factory tests, provider-contract
and install packaging coverage, and provider documentation. Generic skills and
normalized command schemas stay unchanged. GitLab remains a forge-only
provider. No new runtime dependency is required.
