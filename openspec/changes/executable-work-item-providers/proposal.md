# Proposal

## Why

Repository provider selection is generic, but lifecycle operations are not:
local files support creation only and remote create/link/note behavior exists
only as prose. Delivery needs one deterministic operation boundary so selected
providers work rather than merely appear configured.

## What Changes

- Add one provider-neutral work-item operation command for list, read, create,
  link, and note.
- Complete the local-files backend with allocation, parsing, dependency links,
  typed items, and idempotent audit notes.
- Define and validate an executable JSON protocol for remote provider adapters.
- Route delivery workflows through the operation command and fail closed when
  a selected provider lacks an operation.
- Keep creation approval-gated and status transitions human-owned.

## Capabilities

### New Capabilities

- `work-item-operations`: Executable, normalized lifecycle operations for local
  and remote work-item providers.

### Modified Capabilities

None.

## Impact

Work-item schemas and scripts, runtime capability validation, local storage,
provider adapter contracts, delivery and stage skills, documentation, and
integration tests change. No new external dependency is required.
