## Why

Two problems showed up in the 19 November delivery sessions:

- The comment filter treated a thread as handled only when the audit reply
  came from `factory` or `delivery-bot`. The factory posts as the account that
  opened the change, so threads it had already answered were scoped again, and
  release readiness counted them as unanswered.
- Every GitLab 404 read "GitLab did not find that merge request", even for a
  create, a find, or a note. GitLab answers 404 when a token cannot see a
  private project, so sessions with more than one token spent many steps
  reading provider source to find the cause.

## What Changes

- `forge-comments.ts --change <change.json>` adds the change's author to the
  factory authors. `/address-comments` passes its `find` result and release
  readiness passes its `read` result.
- GitLab, GitHub, and Jira 404 messages name the request, the token source
  where there is one, and say the token or account may lack access.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `address-comments`: a thread answered from the change author's account counts
  as handled.
- `forge-operations`: provider 404 messages name the request and the
  likely missing access.

## Impact

`factory/scripts/forge-comments.ts`, `providers/gitlab/gitlab-host.ts`,
`providers/gitlab/gitlab-forge.ts`, `providers/gitlab/gitlab-work-item.ts`,
`providers/github/github-client.ts`, `providers/jira/jira-tracker.ts`, the
address-comments skill, the release-readiness workflow, and
`docs/troubleshooting.md`.
