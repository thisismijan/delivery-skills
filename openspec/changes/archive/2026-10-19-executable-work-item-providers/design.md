# Design

## Context

The repository already persists an explicit provider choice. `local-files`
renders one markdown shape, while remote provider operations are described but
not invoked. See `proposal.md` and `specs/work-item-operations/spec.md`.

## Goals / Non-Goals

**Goals:**

- Give every stage one deterministic work-item command.
- Make local files a complete useful backend.
- Let remote adapters execute without embedding vendor names in core.
- Validate every boundary and preserve replay safety.

**Non-Goals:**

- Shipping a particular remote vendor adapter in this change.
- Migrating work items when provider selection changes.
- Automating status transitions, deletion, or unapproved creation.

## Decisions

### Use a single command with operation-specific JSON schemas

`work-item-provider.ts` resolves repository selection, validates the live
runtime, and dispatches list, read, create, link, or note. Inputs and outputs
are strict schemas. Skills call this command instead of improvising provider
calls.

### Use `exec:` invocations for portable remote adapters

An executable remote descriptor uses `exec:/absolute/path`. The command spawns
that path directly, passes the operation as one argv value and JSON on stdin,
and parses JSON from stdout. It never invokes a shell. Other opaque invocation
forms fail with a host-bridge remedy.

Alternative: split invocation into arbitrary argv in the manifest. Rejected
because it increases command-injection and quoting risk. Provider wrappers can
own their fixed arguments.

### Store local items as structured JSON

Canonical local items live at `.delivery/work-items/<encoded-ref>.json`.
Strict JSON supports type, dependencies, and audit notes without parsing
Markdown. Existing `.md` items remain readable through a narrow compatibility
parser and can be rewritten as JSON on the next mutation.

### Allocate local references under a lock

Creation without a reference takes an exclusive allocation lock, scans
existing local references, chooses the next `LOCAL-N`, writes atomically, and
releases the lock. An abandoned lock produces a recovery remedy rather than a
duplicate id.

## Risks / Trade-offs

- [Remote adapters are not bundled yet] → prove the protocol with a fake
  executable and fail honestly until a selected adapter advertises `exec:`.
- [JSON replaces human-friendly Markdown] → keep files readable and pretty
  printed; preserve compatibility reads for existing markdown items.
- [One process per operation] → acceptable for lifecycle control operations;
  batching can be added without changing schemas.
- [Concurrent allocation] → exclusive lock plus atomic rename prevents
  collisions.

## Migration Plan

1. Add schemas and complete local operations.
2. Add remote executable dispatch and contract tests.
3. Route live workflow instructions through the command.
4. Existing markdown local items remain readable; new and mutated items use
   canonical JSON.
