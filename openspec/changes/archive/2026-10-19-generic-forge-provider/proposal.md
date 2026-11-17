# Proposal

## Why

Delivery describes forge and review publication as provider-neutral capabilities,
but live workflows still call GitLab-shaped helpers and identifiers directly.
That prevents the skill pack from working unchanged with GitHub, another forge,
or a host-native integration.

## What Changes

- Add one deterministic forge command for normalized change discovery, metadata,
  review context, draft creation/state, notes, and discussion replies.
- Define a shell-free executable adapter protocol with strict versioned JSON
  inputs and outputs and sanitized failures.
- Move GitLab-specific API behavior behind a conforming provider adapter.
- Route delivery, correctness review, approach review, and comment handling
  through normalized operations.
- Keep merge, close, and thread-resolution actions outside the provider
  interface and human-owned.

## Capabilities

### New Capabilities

- `forge-operations`: Provider-neutral change and review operations, adapter
  execution, publication safety, and human-owned boundaries.

### Modified Capabilities

None.

## Impact

This affects factory scripts and tests, the GitLab provider package, runtime
capability descriptors, delivery and review skills, installation documentation,
and workflow regression contracts. Existing `gl-mr` and `gl-note` wrappers may
remain as provider internals or compatibility entry points, but generic skills
will no longer invoke them.
