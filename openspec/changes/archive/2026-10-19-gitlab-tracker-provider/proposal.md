# Proposal

## Why

Selecting the GitLab provider currently advertises merge-request and review
operations, but GitLab issues are not a selectable work-item backend. Generic
workflows already speak a portable work-item protocol, so repositories that
track work as GitLab issues still cannot confirm that provider. Compatibility
wrappers `gl-mr` and `gl-note` remain installed even though live skills no
longer call them.

## What Changes

- Extend the installed GitLab provider so one selection substantiates
  `forge.change`, `review.publish`, and `tracker.item`.
- Add an executable GitLab work-item adapter that implements list, read,
  approved create, approved dependency links, and idempotent notes against
  the existing work-item schemas and stdin protocol.
- Reuse GitLab host, project, and token discovery with the forge adapter
  without placing credentials on argv or in errors.
- Evolve provider-contract evaluation generically so a provider can advertise
  multiple capabilities without breaking existing forge-only and tracker-only
  manifests.
- After tests prove generic skills and packaging use the GitLab executables,
  retire `gl-mr` and `gl-note` from the provider package, setup, readiness,
  and docs.

## Capabilities

### New Capabilities

- `gitlab-issue-tracking`: GitLab issues as a portable work-item provider,
  including executable adapter behavior, multi-capability GitLab selection,
  and retirement of GitLab compatibility wrappers.

### Modified Capabilities

None.

## Impact

The GitLab provider package, provider-contract readiness, installer overlay,
doctor, packaging tests, work-item documentation, and host adapter READMEs
change. No new dependency is required. Status transitions and deletes stay
human-owned. Existing repositories still confirm GitLab as the work-item
provider explicitly; installing the provider does not infer that choice from
the forge remote.
