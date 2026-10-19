# GitLab provider

Selected with `./install.sh --skills-dir <path> --provider gitlab`.

Setup installs `gitlab-forge` and `gitlab-work-item` into
`${DELIVERY_BIN_DIR:-$HOME/.local/bin}` together with the shared host module
they import. One selection advertises `exec:<absolute-path>` with
`provider: "gitlab"` for `forge.change`, `review.publish`, and `tracker.item`.
Generic workflows call `forge-provider.ts` and `work-item-provider.ts`; they
never call provider-native helpers.

`gitlab-forge` takes one operation argument (`find`, `read`, `files`, `diff`,
`commits`, `discussions`, `anchors`, `create`, `set-draft`, `note`, or
`reply`) and a version-1 JSON request on stdin. `gitlab-work-item` takes
`list`, `read`, `create`, `link`, or `note` and the work-item envelope on
stdin. Both derive host and project from the repository origin, read
credentials from `GITLAB_TOKEN`, `GL_TOKEN_FILE`, or `~/token` (never argv),
and print versioned JSON. They do not merge, close, approve, delete, resolve
discussions, or transition issue status.

Forge, review-publication, and tracker capabilities become available only when
both executables, `bun`, and a credential are present. Installing this provider
does not select GitLab issues as the repository work-item source; confirm that
choice with `/delivery init`.

Provide a credential with `GITLAB_TOKEN`, `GL_TOKEN_FILE`, or `~/token`, then
run:

```bash
bun "<skills-dir>/_factory/scripts/doctor.ts"
```

Doctor reports whether a credential is present but never prints its value.
