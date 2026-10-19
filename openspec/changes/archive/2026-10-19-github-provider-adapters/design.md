# Design

## Context

`forge-provider.ts` and `work-item-provider.ts` already own the generic
boundary: operation argv, version-1 JSON stdin/stdout, approval checks, and
core-owned note-body validation. GitLab implements forge and review behind
`gitlab-forge`. Tracker remote dispatch exists, but no GitHub adapter does.
See `proposal.md` and `specs/github-delivery-provider/spec.md`.

Forge `read`/`create`/`note` overlap tracker operation names, so one executable
cannot serve both protocols.

## Goals / Non-Goals

**Goals:**

- Share GitHub auth and repository discovery across forge and tracker adapters.
- Return only schema-valid normalized results from injected HTTP fixtures.
- Let a provider manifest advertise every capability it can probe.
- Keep credentials out of argv, URLs, and human-facing errors.

**Non-Goals:**

- GraphQL, merge queue automation, or Checks UI reconstruction.
- Changing generic skill text or forge/work-item schemas.
- Deleting GitHub issues, closing them, resolving threads, or removing
  dependency links.
- Making doctor assume GitHub is always selected.

## Decisions

### Two executables, one shared client

Install `github-forge` and `github-tracker` beside a shared `github-client.ts`.
Forge operations stay on `github-forge`; work-item operations stay on
`github-tracker`. The runtime advertises `forge.change` and `review.publish`
with the forge executable and `tracker.item` with the tracker executable.

A single executable was rejected because `read`, `create`, and `note` mean
different things on the two protocols. Bundling at install time was rejected
because GitLab already ships source as `#!/usr/bin/env bun` files.

### REST only, with pagination and complete-diff refusal

Use GitHub REST with `per_page`/`page`. Listings that fill the page budget
fail closed. Files and diff compare listed files to `changed_files` and refuse
when a file with textual changes omits `patch`.

Compare-API `truncated` as a second source of truth was rejected as an extra
live call that fixtures would have to duplicate; the files listing plus
`changed_files` is the observable GitHub truncation signal.

### Map review threads without inventing resolution

Issue comments become unanchored discussions. Review comments group by root
id (`in_reply_to_id` or own id). Inline anchors use `path` plus `line`, with
`LEFT` as `old` and `RIGHT` as `new`. `resolved` is false unless GitHub REST
supplies it. Reply posts `in_reply_to` on a review-thread id and refuses
issue-comment ids.

GraphQL thread resolution was rejected because the requirement is REST.

### Draft operations use GitHub draft endpoints

Create sends `draft: true`. `set-draft` uses `convertToDraft` and
`ready_for_review` rather than rewriting titles. GitLab's `Draft:` title
prefix stays GitLab-specific.

### Token and repository discovery are shared and explicit

Token order: `GITHUB_TOKEN`, then `GH_TOKEN`, then `GH_TOKEN_FILE`, then
`~/token`. Origin parsing yields `owner/repo` and host; `api.github.com` is
used for github.com and `<host>/api/v3` for other hosts. Overrides:
`GH_HOST`/`GITHUB_HOST` and `GH_REPO`/`GITHUB_REPOSITORY`.

Passing tokens as argv or query was rejected because process listings and
error URLs leak credentials.

### Issue identity uses body and comment markers

Create stores `<!-- delivery-source-audit-id: <auditId> -->` in the issue
body. Notes store `<!-- delivery-note-audit-id: <auditId> -->` in comments
and update in place on replay. `blockedBy` uses issue-dependency REST when
present and never DELETE. If the requested set would remove a link, the
adapter refuses.

Labels-as-audit-ids were rejected because they are visible workflow state.
Search API was rejected because it is delayed and not fixture-deterministic.

### Provider contract grows capabilities without renaming kind

Keep required `kind` for compatibility. An optional `capabilities` array
lists what the provider claims. Omitted arrays keep today's mapping: forge
means change plus review, tracker means `tracker.item`. GitHub lists all
three. Probes stay per capability (executable + bun + credential) so a
missing tracker binary does not invent a work-item invocation.

Hard-coding `if (name === "github")` as the only extension point was rejected
in favor of advertised capabilities plus provider-specific credential/exec
details.

## Risks / Trade-offs

- **[GitHub omits patch on some binaries]** → Refuse only when additions,
  deletions, or changes are nonzero and `patch` is missing.
- **[Issue dependency REST is unavailable on some hosts]** → Fail link with a
  setup remedy rather than encoding links as comments that generic callers
  cannot round-trip.
- **[Doctor still mentions GitLab helpers]** → Leave that legacy check; GitHub
  readiness lives on provider status so an unselected GitHub provider does
  not appear as a generic doctor gap.
- **[Shared client must be copied next to executables]** → Setup copies
  `github-client.ts` into the bin dir; tests assert the installed forge file
  still imports it relatively and does not embed pack paths.

## Migration Plan

1. Add the GitHub client, adapters, fixtures, and contract tests.
2. Teach provider packaging to advertise multiple capabilities.
3. Install with `--provider github`; overlay only passing capabilities.
4. Roll back by omitting the provider flag; no remote data migration.
