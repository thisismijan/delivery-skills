# Proposal

## Why

Delivery currently describes work items as tracker tickets and assumes a
tracker capability at materialization boundaries. Repositories should choose
their own durable work-item source, including local files, Jira, forge issues,
or another adapter, and delivery must confirm rather than infer that choice.

## What Changes

- Add a versioned repository work-item configuration selected explicitly on
  first lifecycle use.
- Always offer local files and add any live runtime work-item providers to the
  choice presented to the operator.
- Persist and validate the confirmed choice without deriving it from remotes,
  credentials, host names, or ticket-key shape.
- Route work-item reads, creation, dependency links, and handoffs through the
  selected provider while preserving existing approval and human-owned status
  boundaries.
- Make initialization and doctor report the repository choice and exact setup
  remedy.

## Capabilities

### New Capabilities

- `generic-work-items`: Repository-level provider discovery, explicit
  confirmation, durable selection, and provider-neutral work-item lifecycle.

### Modified Capabilities

None.

## Impact

The runtime manifest, provider contracts, target bootstrap, doctor, delivery
conductor, grooming handoff, workflow documentation, README, and contract tests
change. Existing Jira setup remains compatible as one provider option; no
remote work item is created or changed merely by selecting a provider.
