# GitHub provider

Selected with `./install.sh --skills-dir <path> --provider github`.

Setup installs `github-forge` and `github-tracker` into
`${DELIVERY_BIN_DIR:-$HOME/.local/bin}` and advertises `provider: "github"` for
`forge.change`, `review.publish`, and `tracker.item` when the executables,
Bun, and a credential are present. Generic workflows call `forge-provider.ts`
and `work-item-provider.ts`; they never invoke these adapters by name.

Add that bin directory to `PATH`. Mix with Jira by repeating `--provider`:

```bash
./install.sh --skills-dir <path> --provider github --provider jira
```

Host wrappers default to GitLab; pass `--provider github` after the wrapper
to replace it. See [`adapters/README.md`](../../adapters/README.md).

## Protocol

Both executables take one operation argument and a version-1 JSON request on
stdin. Host and repository come from git origin, with `GH_HOST` /
`GITHUB_HOST` and `GH_REPO` / `GITHUB_REPOSITORY` overrides for GitHub
Enterprise. Credentials come from `GITHUB_TOKEN`, `GH_TOKEN`,
`GH_TOKEN_FILE`, or `~/token` and never from argv. Prefer an env token over
`~/token` if GitLab might also use that file.

`github-forge` operations: `find`, `read`, `pipeline`, `files`, `diff`, `commits`,
`discussions`, `anchors`, `approvals`, `create`, `set-draft`, `note`, `reply`,
`land`. It does not offer `failures` or `retry` yet, so a run that would
retry a CI failure stops for the operator. Listings
paginate. Truncated diffs are refused. Draft pull requests are created. GitHub has no per-pull-request squash
flag, so set squash merging as the repository default. The
adapter does not merge, close, approve, delete, or resolve discussions, except
that `land` squash-merges with the head commit as its guard after the forge
provider's land gate holds. `approvals` uses each reviewer's latest decision:
at least one approval and no outstanding change request. Branch protection
still applies, because GitHub refuses a merge it does not allow.

`github-tracker` operations: `list`, `read`, `create`, `link`, `note`. Create
and note replay by audit id. Dependency links are additive only. Status and
delete stay human-owned: GitHub issues have no board columns this adapter
reads, so board sync always skips on GitHub.

Note bodies are checked by delivery core before `note` or `reply`.

### Placing created issues

`create` assigns and plans the new issue from the repository's settings,
recorded with `delivery-init.ts --work-items github --setting key=value`:

- `assignee`: unset or `me` assigns the user the credential belongs to.
  `none` leaves the issue unassigned. Any other value is a GitHub login, which
  must exist.
- `milestone`: unset or `none` sets no milestone. Any other value must be the
  exact title of one open milestone in the repository.

A work item's `parent` must be an issue number in the same repository, such as
`12` or `#12`. The new issue is added as a sub-issue of it.

Every lookup runs before the issue is created, so an unknown login, milestone
or parent creates nothing. A replayed create returns the existing issue
without reassigning or re-planning it. It only adds a parent when the issue
has none. Issues report their first assignee as `assignee`, their milestone
title as `sprint`, and their parent issue as `parent`.

## Credentials

A fine-grained token needs contents, pull requests, and issues on the target
repository. Add checks if pipeline evidence is required. Doctor reports
whether a credential is present, never its value.

After install:

```bash
bun "<skills-dir>/_factory/scripts/doctor.ts"
bun "<skills-dir>/_factory/scripts/delivery-init.ts" --work-items github
```

Origin and credentials are not consent to use GitHub issues. Confirm that
choice explicitly if issues should be the work-item source.

If the host exposes GitHub session tools, `/delivery doctor` records them and
prefers those tools for mapped pull-request and issue operations. Merge,
close, approve, and review-submit stay unused.
