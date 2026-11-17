# Work-item providers

Each target repository confirms one provider in
`.delivery/work-items.json`. Delivery never chooses from a git remote,
credential, host name, environment variable, or reference shape.

List the choices substantiated by the installed runtime:

```bash
bun "$FACTORY_ROOT/scripts/work-item-config.ts" options \
  "$FACTORY_ROOT/runtime-manifest.json"
```

Then confirm one through `/delivery init`, or directly:

```bash
bun "$FACTORY_ROOT/scripts/delivery-init.ts" --work-items <provider-id>
```

Changing an existing choice requires a second explicit confirmation and
`--replace`. Selection does not migrate or mutate existing work items.

## Local files

`local-files` is always available. Approved items live under
`.delivery/work-items/` as readable JSON and use allocated references such as
`LOCAL-1`. The backend supports list, read, approved create, approved dependency
links, and idempotent audit notes. Existing markdown items remain readable. No
network service or remote tracker capability is required.

All stages use one command:

```bash
bun "$FACTORY_ROOT/scripts/work-item-provider.ts" \
  <list|read|create|link|note> \
  "<repository-root>" "$FACTORY_ROOT/runtime-manifest.json" [input.json]
```

Create inputs require `approved: true` and a stable `auditId`; link inputs
require `approved: true`. Notes use one `auditId`, so replay updates that note
instead of adding duplicates.

## Remote providers

Remote systems appear when the runtime advertises an available
`tracker.item` capability with an exact `provider` id and invocation, or when
recorded session tools map the complete tracker operations. A forge
remote by itself does not enable forge issues. If a saved remote provider is
unavailable later, delivery stops rather than falling back to local files.

| Id | When it appears | Confirm with |
|----|-----------------|--------------|
| `github` | GitHub provider ready | `--work-items github` |
| `gitlab` | GitLab provider ready | `--work-items gitlab` |
| `jira` | Jira provider ready | `--work-items jira` |

Changing a choice needs `--replace`. Selection does not migrate items.

An executable adapter invocation is `exec:/absolute/path/to/adapter`. The
adapter receives the operation as its only argument and a version-1 JSON
envelope on stdin, then writes one normalized work item (or an array for
`list`) to stdout. Core launches the executable directly without a shell.
Malformed JSON, non-zero exit, relative paths, and opaque invocations fail
closed with no fallback.

## Custom providers

A custom adapter uses a lowercase provider id and implements normalized
work-item list, read, create, link, and note operations behind `tracker.item`.
Readiness overlay currently maps GitHub, GitLab, and Jira in
`scripts/provider-contract.ts`; a new name needs that mapping. Credentials
stay in the host integration.

## Board status

Two more operations let delivery move tickets on the board. `statuses` takes
`{ "ref" }` and returns `{ version, provider, ref, current, statuses }`:
the settable columns in board order, and the ticket's column (`null` when it
sits before the first one). `transition` takes `{ "approved": true, "ref",
"to" }` and returns the same shape after the move. Core refuses a transition
unless `.delivery/board-status.json` is confirmed for the selected provider
and names the target, and fails when the ticket did not land there. Both run
only through the executable adapter, never through session tools.

`scripts/board-status.ts propose` maps the columns to the phases `ready`,
`in-progress`, `in-review`, and `done`, and leaves an ambiguous column or a
phase with two candidates for the operator. `confirm` writes the map with the
operator's approval words. `sync` moves a ticket forward to its phase's column
and skips, with a reason, when there is no map, the board changed, or the
ticket is already at or past that column. Local files, GitLab, and Jira
implement both operations; Jira needs a `board` setting for the column order.
Closing, reopening, deleting, and backwards moves stay human-owned regardless
of provider.

See [`docs/extending.md`](../docs/extending.md) and
[`providers/README.md`](../providers/README.md).
