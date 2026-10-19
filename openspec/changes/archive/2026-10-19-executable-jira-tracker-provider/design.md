# Design

## Context

`work-item-provider.ts` already dispatches list, read, create, link, and note
through strict schemas and an `exec:` adapter protocol. The packaged Jira
provider still reports a host-runtime probe and advertises `tracker.item` as
unavailable. See `proposal.md` and `specs/jira-work-items/spec.md`.

The GitLab forge adapter is the local pattern: one Bun executable, injected
HTTP for tests, credentials from env/file, sanitised failures, and a setup
script that copies the file into the bin directory.

## Goals / Non-Goals

**Goals:**

- Implement the five portable operations against Jira Cloud REST with no shell.
- Keep site, project, and credentials out of argv, URLs, and error text.
- Make create and notes replay-safe using Jira-native identifiers.
- Advertise the adapter only when setup can actually run it.

**Non-Goals:**

- Jira Server or Data Center compatibility as a first-class target.
- Status transitions, issue deletion, assignment, or workflow edits.
- Changing generic work-item schemas or embedding Jira names in skills.
- Migrating existing local-file or forge work items into Jira.

## Decisions

### One self-contained `jira-tracker` executable

Setup copies `providers/jira/jira-tracker.ts` to
`${DELIVERY_BIN_DIR:-$HOME/.local/bin}/jira-tracker`. Readiness advertises
`exec:<absolute-path>` with `provider: "jira"` for `tracker.item`.

A wrapper around `curl` was rejected because the protocol forbids shell
invocation and makes credential leakage harder to test. Teaching the host to
call Jira MCP tools was rejected because delivery already has an executable
bridge and must not infer Jira from host integrations.

### Site and project come from environment, not git remotes

Jira Cloud cannot be derived from a forge origin. The adapter reads
`JIRA_SITE` and `JIRA_PROJECT`. Credentials are `JIRA_EMAIL` plus
`JIRA_API_TOKEN` or `JIRA_TOKEN`, else `JIRA_TOKEN_FILE`, else `~/jira-token`.
The file accepts `email:token` on one line or email then token on two lines.

Inferring the site from an Atlassian URL in git remotes was rejected because
work-item selection must stay explicit. Putting credentials on argv was
rejected because process listings and host permission prompts would leak them.

### Direct HTTPS with injectable transport

Production uses `fetch` against `${JIRA_SITE}/rest/api/3/...` with HTTP Basic
`email:token`. Tests inject `jiraRequest` and never open a network socket.
Authorization headers are sent, but tokens never appear in URLs. Error text
redacts email, token, and the Basic blob; HTTP bodies from Jira are not
echoed.

### Audit-id idempotency uses a label plus an issue property

On create, the adapter searches the project for a label derived from the audit
id (`dlv-` plus a label-safe encoding). A matching issue is confirmed with
issue property `delivery.sourceAuditId`. Same content returns that issue;
different content fails. New issues get both the label and the property, then
blocker links.

Searching description text was rejected as brittle. Audit ids can contain
characters Jira labels reject, so the encoding plus property confirmation is
the recoverable key. JQL property search alone was rejected as a sole
mechanism because property indexing is not guaranteed for REST-set properties.

Optional create `ref` cannot allocate a chosen Jira key. If present, it must
already identify the audit-id hit; otherwise the adapter fails rather than
inventing a key.

### Dependency links use the Blocks issue-link type

`blockedBy` maps to Jira "Blocks" links where the current issue is blocked by
the named keys (`outwardIssue` on the current issue). Link replaces that set:
add missing, delete extra Blocks/is-blocked-by links, leave Relates and other
types untouched. Deleting a link is not deleting an issue.

Custom link-type configuration was deferred; Cloud projects include Blocks by
default, and a missing type fails closed with a setup remedy.

### Audit notes are tagged comments

Each note comment starts with `delivery-audit-id: <id>` then the body. Replay
finds that comment: identical body is a no-op, different body updates it.
`notes` on the normalized item includes only tagged comments. Status and
delete APIs are in a forbidden operation set and never called.

Plain Jira comments without the marker stay outside the normalized note list
so human discussion is not given invented audit ids.

### Readiness requires executable, bun, site, project, and credentials

Unlike GitLab forge, Jira has no repository-origin fallback, so missing site
or project keeps `tracker.item` unavailable. Doctor and generic skills are
unchanged; Jira remedies live in provider status output.

## Risks / Trade-offs

- [Label encoding collisions] → confirm every label hit against the issue
  property before reuse; conflicting property values fail closed.
- [Blocks link type renamed in a project] → fail with a setup remedy rather
  than guessing Relates.
- [Empty Jira descriptions] → if converted description text is empty, use the
  summary so the strict work-item schema still validates.
- [List of a large project] → paginate with a page cap and fail rather than
  return a silent prefix.
- [Jira search API deprecation] → call `/rest/api/3/search` with JQL in tests
  and production; swapping to `/search/jql` later does not change the
  normalized contract.

## Migration Plan

1. Add the adapter, fixtures, and injected-HTTP tests.
2. Install via existing `--provider jira` and overlay `tracker.item` when
   ready.
3. Operators set site, project, and credentials, then confirm Jira as the
   repository work-item provider.
4. Rollback removes the executable and restores the previous unavailable
   probe; no Jira issues are deleted.
