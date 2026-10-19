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
`discussions`, `anchors`, `create`, `set-draft`, `note`, `reply`. Listings
paginate. Truncated diffs are refused. Draft pull requests are created. The
adapter does not merge, close, approve, delete, or resolve discussions.

`github-tracker` operations: `list`, `read`, `create`, `link`, `note`. Create
and note replay by audit id. Dependency links are additive only. Status and
delete stay human-owned.

Note bodies are checked by delivery core before `note` or `reply`.

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
