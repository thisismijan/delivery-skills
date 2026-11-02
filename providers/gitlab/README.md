# GitLab provider

Selected with `./install.sh --skills-dir <path> --provider gitlab`.

Setup installs `gitlab-forge` and `gitlab-work-item` into
`${DELIVERY_BIN_DIR:-$HOME/.local/bin}` together with the shared host module.
One selection advertises `provider: "gitlab"` for `forge.change`,
`review.publish`, and `tracker.item` when both executables, Bun, and a
credential are present.

Add that bin directory to `PATH`. Mix with Jira:

```bash
./install.sh --skills-dir <path> --provider gitlab --provider jira
```

Cursor and Claude wrappers already pass `--provider gitlab`. Extra
`--provider` flags still overlay.

## Protocol

`gitlab-forge` takes `find`, `read`, `pipeline`, `files`, `diff`, `commits`,
`discussions`, `anchors`, `approvals`, `create`, `set-draft`, `note`, `reply`,
`land`, `failures`, or `retry`.
`gitlab-work-item` takes `list`, `read`, `create`, `link`, `note`,
`statuses`, or `transition`. Both read stdin JSON and write versioned JSON.
They do not merge, close, reopen, approve, delete, or resolve discussions,
except that `land` squash-merges with the head commit as its guard and removes
the source branch, after the forge provider's land gate holds. `approvals`
counts the merge request's approval rules as met only when GitLab reports it
approved with no approvals left.

`failures` reads the newest merge request pipeline at the head, including
retried jobs, so a job retried once shows attempt 2. It adds the end of each
failed job's log, with terminal colours removed, and leaves
the log out when GitLab will not return it. `retry` retries the given jobs, or
re-adds the merge request to the merge train with the head commit as its
guard, because GitLab does not retry jobs in a merge train pipeline.

Every author, on the change, its comments, and its approvals, is the GitLab
username, so a commenter can be matched to their approval. `discussions` also
returns each comment's time and, from the merge request's own system notes,
when it was marked ready or draft, approved or unapproved (including approvals
reset by a push), pushed, and queued. If any system note has no time, those
events are left out and the settle check asks the operator instead of
guessing.

Board columns are the label lists of the project's issue board, in board
order. With more than one board, record the one to use with
`--setting board=<board-id>`. A move adds the target list label and removes
the previous one. A closed issue is never moved or reopened.

Host and project come from origin. Override with `GL_HOST` and `GL_PROJECT`
for self-hosted GitLab when origin is not enough. Credentials:
`GITLAB_TOKEN`, `GL_TOKEN_FILE`, or `~/token` (never argv). Publishing notes
needs an `api` token, not `read_api`.

`providers/gitlab/cloud-setup.sh` is an extra Cloud helper that also requires
`GITLAB_TOKEN`. Ordinary installs use `setup.sh` via `--provider gitlab`.

## First use

```bash
bun "<skills-dir>/_factory/scripts/doctor.ts"
bun "<skills-dir>/_factory/scripts/delivery-init.ts" --work-items gitlab
```

Installing this provider does not select GitLab issues as the work-item
source. Confirm that with init. Doctor reports credential presence only.

If the host exposes GitLab session tools, `/delivery doctor` records them and
prefers those tools for mapped merge-request and issue operations. Merge,
close, approve, and thread resolution stay unused.
