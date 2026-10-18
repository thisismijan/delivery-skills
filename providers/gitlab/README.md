# GitLab forge provider

Selected with `./install.sh --skills-dir <path> --provider gitlab`.

Setup installs `gitlab-forge` into `${DELIVERY_BIN_DIR:-$HOME/.local/bin}`
and advertises it as `exec:<absolute-path>` with `provider: "gitlab"` for both
`forge.change` and `review.publish`. Compatibility helpers `gl-mr` and
`gl-note` are installed beside it for existing callers; generic workflows use
`gitlab-forge`.

`gitlab-forge` takes one operation argument (`find`, `read`, `files`, `diff`,
`commits`, `discussions`, `anchors`, `create`, `set-draft`, `note`, or
`reply`) and a version-1 JSON request on stdin. It derives host and project
from the repository origin, reads credentials from `GITLAB_TOKEN`,
`GL_TOKEN_FILE`, or `~/token` (never argv), and prints versioned JSON. It
does not merge, close, approve, delete, or resolve discussions.

Forge and review-publication capabilities become available only when
`gitlab-forge`, `bun`, and a credential are present.

Provide a credential with `GITLAB_TOKEN`, `GL_TOKEN_FILE`, or `~/token`, then
run:

```bash
bun "<skills-dir>/_factory/scripts/doctor.ts"
```

Doctor reports whether a credential is present but never prints its value.

This provider supplies merge-request metadata and review publication. It does
not claim GitLab issue operations. GitLab issues become a selectable
repository work-item provider only when an adapter separately advertises an
available `tracker.item` capability with its exact provider id.
