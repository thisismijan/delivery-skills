# Design

## Context

The runtime has one generic `tracker.item` capability, but its descriptor does
not identify a provider. Workflow prose still treats tracker tickets as the
canonical materialization. Target initialization writes ignore rules but has no
repository integration choice. See `proposal.md` and
`specs/generic-work-items/spec.md`.

## Goals / Non-Goals

**Goals:**

- Make work-item identity a durable repository decision.
- Keep provider discovery deterministic and capability-backed.
- Make local files useful without weakening remote-provider checks.
- Preserve approval, idempotency, and human-owned status boundaries.

**Non-Goals:**

- Migrating existing items when the selection changes.
- Bundling credentials or silently enabling Jira or forge issue APIs.
- Treating the repository's forge remote as consent to use its issue tracker.

## Decisions

### Store the choice separately from host runtime capability

Write `.delivery/work-items.json` with schema version, provider id, provider
kind, and explicit confirmation marker. Runtime capability says what this
session can execute; repository configuration says what the operator chose.
Conflating them would make a host or credential change silently change ticket
systems.

### Add provider identity to `tracker.item`

The optional `provider` field on a runtime capability identifies the
work-item implementation without exposing credentials. Provider overlays own
this value. A remote selection is valid only when its id matches the live
`tracker.item` descriptor. This is additive to runtime-manifest version 1.

Alternatives considered:

- Derive identity from invocation: rejected because invocation is an opaque
  execution reference.
- Infer Jira or forge issues from credentials/remotes: rejected because
  availability is not operator intent.

### Use a deterministic repository-selection CLI

`work-item-config.ts` owns option discovery, schema validation, atomic
configuration writes, symlink refusal, and live revalidation. The conductor
owns the human question and passes the exact confirmed id to the CLI. This
keeps conversational choice separate from filesystem authority.

### Treat local files as a provider, not a fallback

`local-files` is always an option and needs no runtime tracker capability. It
uses `.delivery/work-items/` and stable local keys. It is never selected
implicitly. If a saved remote provider becomes unavailable, delivery stops
instead of changing storage semantics.

### Keep normalized work-item operations provider-neutral

Workflow language uses “work item” and the selected provider. Existing
`tracker.item` remains the portable remote operation boundary for
compatibility. Provider-specific adapters may implement Jira, GitLab issues,
GitHub issues, or another system behind that contract.

## Risks / Trade-offs

- [One remote provider per runtime manifest] → expose exactly the substantiated
  provider today; a later manifest version can advertise multiple concurrent
  work-item providers without changing repository configuration.
- [Changing provider leaves old references] → replace configuration only after
  explicit confirmation and state clearly that migration is separate.
- [Local files can be mistaken for remote tickets] → use normalized local keys
  and persist provider id alongside run state.
- [Existing repositories have no selection] → ask once at the next
  work-item-dependent entry; help and doctor remain non-mutating.

## Migration Plan

1. Ship additive manifest/provider identity and deterministic configuration.
2. Update init and conductor to confirm on first use.
3. Replace tracker-specific workflow wording and test both local and remote
   paths.
4. Existing repositories choose once on their next work-item-dependent run.
   Rollback removes the new check without altering external work items.
