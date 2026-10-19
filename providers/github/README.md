# GitHub provider

Selected with `./install.sh --skills-dir <path> --provider github`.

Setup installs `github-forge` and `github-tracker` into
`${DELIVERY_BIN_DIR:-$HOME/.local/bin}` and advertises `provider: "github"` for
`forge.change`, `review.publish`, and `tracker.item`. One install selection
substantiates all three when the executables, Bun, and a credential are
present. Generic workflows still call `forge-provider.ts` and
`work-item-provider.ts`; they never invoke these adapters by name.

Both executables take one operation argument and a version-1 JSON request on
stdin. They share host and repository discovery from the git origin, with
explicit `GH_HOST`/`GITHUB_HOST` and `GH_REPO`/`GITHUB_REPOSITORY` overrides.
Credentials come from `GITHUB_TOKEN`, `GH_TOKEN`, `GH_TOKEN_FILE`, or `~/token`
and are never placed on argv.

`github-forge` operations are `find`, `read`, `files`, `diff`, `commits`,
`discussions`, `anchors`, `create`, `set-draft`, `note`, and `reply`. It
paginates listings, refuses truncated diffs, creates draft pull requests, and
maps review comments into threads. It does not merge, close, approve, delete,
or resolve discussions.

`github-tracker` operations are `list`, `read`, `create`, `link`, and `note`.
Create and note replay by audit id. Dependency links are additive only. The
adapter does not change issue status or delete issues or links.

Note bodies are still checked by the delivery core before `note` or `reply`
reaches this provider.

Provide a credential, then run:

```bash
bun "<skills-dir>/_factory/scripts/doctor.ts"
```

Doctor reports whether a credential is present but never prints its value.
After install, confirm the repository work-item provider explicitly if GitHub
issues should be used; origin and credentials are not consent.
