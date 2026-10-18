# GitLab forge provider

Selected with `./install.sh --skills-dir <path> --provider gitlab`.

Setup installs `gl-mr` and `gl-note` into
`${DELIVERY_BIN_DIR:-$HOME/.local/bin}`. Add that directory to `PATH`. Forge and
review-publication capabilities become available only when both wrappers,
`curl`, `jq`, `awk`, and a credential are present.

Provide a credential with `GITLAB_TOKEN`, `GL_TOKEN_FILE`, or `~/token`, then
run:

```bash
bun "<skills-dir>/_factory/scripts/doctor.ts"
```

Doctor reports whether a credential is present but never prints its value.
