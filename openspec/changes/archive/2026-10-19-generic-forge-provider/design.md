# Design

## Context

The runtime already advertises `forge.change` and `review.publish`, but their
invocations are opaque names and generic skills still call `gl-mr`, `gl-note`,
or prose-only forge actions. Work-item providers established a versioned,
shell-free executable pattern that this boundary can reuse. Publication bodies
already have a deterministic local safety check.

## Goals / Non-Goals

**Goals:**

- Give every live workflow exact provider-neutral commands.
- Keep normalized schemas strict enough that review evidence cannot silently
  lose revisions, discussions, or diff completeness.
- Preserve per-publication human checkpoints and local note-body checks.
- Make one adapter replaceable without changing any skill.

**Non-Goals:**

- Merge, close, delete, approval, status transition, or thread resolution.
- A generic issue tracker implemented through forge issues.
- Translating arbitrary provider-native rich review objects into a common
  editable model.

## Decisions

### One `forge-provider.ts` command owns the generic boundary

Operations are `find`, `read`, `files`, `diff`, `commits`, `discussions`,
`anchors`, `create`, `set-draft`, `note`, and `reply`. Inputs are strict JSON
files; outputs are strict normalized JSON. A single command keeps validation,
capability routing, approval checks, publication safety, and error sanitization
consistent.

Separate per-view commands were rejected because workflows would still need to
know which executable belongs to which provider. One enormous `inspect`
response was rejected because review stages intentionally fetch evidence in a
specific order and should not pay for or trust unused data.

### Capability descriptors carry provider identity and executable invocation

Both `forge.change` and `review.publish` require a lowercase provider id and an
`exec:/absolute/path` invocation. Read and change mutations route through
`forge.change`; note and reply route through `review.publish`. Publication
requires both capabilities to name the same provider, preventing review output
from being sent to an unrelated system.

Shell command strings and host-native opaque references were rejected for the
portable core because they cannot be invoked deterministically or safely across
runtimes. A host can expose native behavior through a small executable bridge.

### Publication safety remains in the core

Note and reply inputs name a body file under the target repository's `.review`
directory. The core resolves and checks it with the existing publication guard,
then sends the validated body to the adapter. Dry-run validates and renders the
normalized request without invoking a remote adapter.

Leaving checks to each adapter was rejected because a new provider could weaken
the secret and path boundary. Passing a body directly on argv was rejected
because it leaks content into process listings and permission prompts.

### The GitLab adapter speaks normalized JSON directly

The provider installs one `gitlab-forge` executable. It derives host/project
from the target repository, reads credentials without placing them in argv,
uses paginated API reads, checks diff overflow, and returns only normalized
results. Existing wrappers remain compatibility tools during migration but are
not advertised to generic workflows.

Wrapping human-oriented `gl-mr` output was rejected because several views are
formatted text rather than stable JSON and create/draft/reply operations are
missing.

### References are opaque; revisions and anchors are explicit

The core never assumes numeric change ids or forge-specific URL forms. Inline
notes carry a normalized file and line anchor. Every evidence result includes
the change ref and head revision where relevant so cached review artifacts can
be checked against live state.

## Risks / Trade-offs

- **[Provider APIs differ in draft and inline-note semantics]** → Keep those
  differences inside adapters and validate only the shared observable result.
- **[A large stderr stream can block an adapter]** → Drain stderr concurrently
  but never include it in human-facing failures.
- **[Strict schemas may reject a provider with missing optional metadata]** →
  Keep only identity, state, branches, revisions, title, and URL mandatory;
  represent unavailable pipeline evidence explicitly.
- **[Compatibility wrappers could drift]** → Tests assert generic skills use
  only `forge-provider.ts`; wrappers are documented as provider-specific.

## Migration Plan

1. Add the normalized command and fake-adapter contract tests.
2. Install and advertise `gitlab-forge` for both forge capabilities.
3. Replace live workflow calls and prose with exact normalized commands.
4. Retain `gl-mr` and `gl-note` temporarily for external callers.
5. Roll back by restoring the prior provider manifest and workflow commands;
   no remote data migration is required.
