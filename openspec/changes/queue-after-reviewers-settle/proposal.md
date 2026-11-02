## Why

In run MDF-3212, seven merge requests merged with a reviewer comment still
unanswered (!976, !978, !987, !989, !995, !1000, !1012), and two more nearly
did (!1001, !1032). Most were queued one to six minutes after leaving draft,
while the review bot takes four to eighteen minutes, or until its morning
pass for changes undrafted overnight. An earlier attempt to add a settle check
in the skill alone failed for four reasons:

- the GitLab adapter reported comment authors by display name but approvers
  by username;
- nothing ended a wait that could not be decided;
- 20 minutes was too short;
- the undraft time was not recorded anywhere reliable.

## What Changes

- **One identity.** The GitLab adapter reports every author (change, comments,
  commits) by username, the same identity approvals use. GitHub already used
  logins.
- **Times and history.** `discussions` returns each comment's `createdAt` and
  an `events` list read from the change's own history: ready, draft,
  approved, unapproved (including approvals reset by a push), pushed, and
  queued. GitLab reads these from system notes, GitHub from the PR timeline.
  When the history is incomplete, `events` is left out.
- **The decision.** New `factory/scripts/reviewer-settle.ts`:
  - `unanswered` when a reviewer comment has no reply, excluding notes that
    ask nothing (acknowledgements, mentions, links, emoji);
  - `settled` when every reviewer who commented approved the current head
    after the last reply;
  - otherwise `settled` once `REVIEW_SETTLE_MINUTES` (default 30) reviewing
    minutes have passed since the latest of leaving draft, the last push, and
    the last comment, with minutes inside `REVIEW_QUIET_HOURS` not counting;
  - `wait` with that time until then;
  - `ask` when the history, approvals, or comment times cannot be read.
  It has a command for readiness and manual queueing.
- **The land gate** runs the check in the same step that merges: `wait` waits,
  and `unanswered` or `ask` stops with the reason.
- **`DELIVERY_FACTORY_AUTHORS`** is documented. It lists usernames, and the
  change author always counts as the operator.
- **A fix to the shared acknowledgement check.** It now recognises
  multi-word acknowledgements such as "looks good", which address-comments
  also uses.

## Capabilities

### New Capabilities

- `reviewer-settle`: a change is queued only after its reviewers settle.

### Modified Capabilities

- `forge-operations`: stable usernames, comment times, and review events.

## Impact

- New `reviewer-settle.ts`, `quiet-hours.ts`, a replay fixture from MDF-3212
  (anonymised), and tests
- `forge-provider.ts`, `land-gate.ts`, `config.ts`, `forge-comments.ts`, both
  forge adapters
- `auto.md`, `release-readiness.md`, README, reference, the GitLab provider
  README
