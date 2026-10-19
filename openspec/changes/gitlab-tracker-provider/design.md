# Design

## Context

See `proposal.md` for motivation. The runtime already routes work-item list,
read, create, link, and note through `work-item-provider.ts` with strict
schemas and an `exec:/absolute/path` remote protocol. The GitLab package
already ships `gitlab-forge` for `forge.change` and `review.publish`, plus
compatibility wrappers `gl-mr` and `gl-note`. Generic skills call the portable
commands; provider-contract still treats GitLab as forge-only.

## Goals / Non-Goals

**Goals:**

- Share host, project, and token discovery between GitLab forge and issue
  adapters without duplicating credential handling.
- Keep GitLab issue HTTP fully injectable so tests never touch the network.
- Advertise three capabilities from one GitLab selection without breaking
  forge-only or tracker-only provider manifests.

**Non-Goals:**

- Inferring GitLab issues from a forge remote or credential.
- Closing, deleting, or transitioning issues.
- Bundling a Jira or GitHub issue adapter in this change.

## Decisions

### Extract shared GitLab host discovery, keep adapters separate

Move origin parsing, token resolution, URL construction, pagination, and the
injected HTTP client into `providers/gitlab/gitlab-host.ts`. `gitlab-forge.ts`
and `gitlab-work-item.ts` import it. Setup copies the shared module beside both
executables.

A single combined executable was rejected because forge and tracker protocols
differ (operations, envelopes, and result schemas). Wrapping GitLab issues
through `gitlab-forge` was rejected because work-item callers must not speak
merge-request operations.

### Encode portable fields in GitLab-safe metadata, not product fields

Issue IIDs are the opaque `ref`. Type and source audit id are stored as HTML
comments in the description so round-trips do not depend on labels or issue
types that vary by GitLab version. Notes prefix the same audit-id comment;
replay updates that note via PUT rather than creating a duplicate.

Putting audit ids in labels was rejected because audit ids contain characters
that are awkward in GitLab labels and would appear in the UI as delivery
machinery.

### Treat link as exact blocked-by membership without deletes

GitLab `is_blocked_by` links map to `blockedBy`. The adapter adds missing
links and treats an already-present link as success. If the requested set
would drop an existing blocker, it fails instead of calling DELETE.

Additive-only link (silently keeping extras) was rejected because the portable
schema is an exact list. Silent extras would make read disagree with the last
approved link payload.

### Provider manifests may list capabilities additively

Provider-contract keeps `kind` and existing GitLab-as-forge / Jira-as-tracker
behavior. An optional `capabilities` array lets GitLab advertise forge, review,
and tracker together. Absent the array, kind still defaults to today's
capability set so Jira and OpenSpec stay compatible.

Hard-coding a second GitLab branch in evaluateProvider without a manifest
field was rejected because GitHub would need the same exception.

### Retire wrappers only after contract tests prove the generic path

Keep `gl-mr` / `gl-note` until tests show generic skills, packaging, and
readiness use `gitlab-forge` and `gitlab-work-item`. Then delete the wrappers,
their tests, and doctor/setup references. Doctor checks the executables and
credential presence, never values.

## Risks / Trade-offs

- **[Create idempotency scans paginated issues for the audit marker]** → Bound
  pages the same way as forge listings; fail closed at the page limit rather
  than create a duplicate.
- **[GitLab assigns IIDs, so create cannot honour a caller-supplied ref]** →
  Reject a non-replay create that names a ref; replay still returns the item
  found by audit id.
- **[Shared host module must be installed next to both binaries]** → Setup
  copies `gitlab-host.ts` unchanged; packaging tests assert the import
  resolves and the installed files contain no pack-root paths.
- **[Removing wrappers breaks external scripts that still call gl-mr]** →
  Document the forge executable as the replacement; this pack no longer
  supports those names.

## Migration Plan

1. Add shared host helpers and the work-item adapter with fixture-backed
   tests.
2. Advertise all three capabilities from GitLab setup and readiness.
3. Prove generic skills and packaging use the executables.
4. Remove `gl-mr` and `gl-note` plus obsolete tests and docs.
5. Roll back by restoring the previous provider package; no GitLab-side data
   migration is required.
