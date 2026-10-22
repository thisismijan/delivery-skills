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
`discussions`, `anchors`, `create`, `set-draft`, `note`, or `reply`.
`gitlab-work-item` takes `list`, `read`, `create`, `link`, or `note`. Both
read stdin JSON and write versioned JSON. They do not merge, close, approve,
delete, resolve discussions, or transition issue status.

Host and project come from origin. Override with `GL_HOST` and `GL_PROJECT`
for self-hosted GitLab when origin is not enough. Credentials:
`GITLAB_TOKEN`, `GL_TOKEN_FILE`, or `~/token` (never argv). Publishing notes
needs an `api` token, not `read_api`.

`providers/gitlab/cloud-setup.sh` is an extra Cloud helper that also requires
`GITLAB_TOKEN`. Ordinary installs use `setup.sh` via `--provider gitlab`.

## Review bots

A review bot posts merge request threads only after the merge request is
posted. Delivery must answer those threads before the change is queued on a
merge train. Configure the bot identities in the shell that runs delivery.
The GitLab provider reports a note's author as the user's display name,
falling back to the username, so list both forms. For example, for Krzysztof
Lupa's review bot, which posts as GitLab user `Krzysztof.Lupa`:

```bash
export DELIVERY_REVIEW_BOTS="Krzysztof Lupa,Krzysztof.Lupa"
export DELIVERY_FACTORY_AUTHORS="factory,delivery-bot,<your display name>"
```

Replies are posted with your own token, so they appear under your GitLab
account. Adding your display name to `DELIVERY_FACTORY_AUTHORS` lets a rerun of
`/address-comments` recognise the threads you already answered. Leaving
`DELIVERY_REVIEW_BOTS` empty turns the check off.

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
