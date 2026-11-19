# Jira tracker provider

Selected with `./install.sh --skills-dir <path> --provider jira`.

This package is **Cloud only** and advertises `tracker.item`. It does not
provide forge or review. Pair it with GitHub or GitLab:

```bash
./install.sh --skills-dir <path> --provider github --provider jira
```

Setup installs `jira-tracker` into `${DELIVERY_BIN_DIR:-$HOME/.local/bin}`.
Add that directory to `PATH`. Installing the package does not infer Jira from
credentials or issue keys.

## Protocol

`jira-tracker` takes `list`, `read`, `create`, `link`, `note`, `statuses`, or
`transition` and a version-1 JSON envelope on stdin. It talks to Jira Cloud
over HTTPS. It does not delete issues.

Board moves need the board id, recorded with `--setting board=<board-id>`.
`statuses` reads that board's column order. `transition` applies the one
workflow transition whose destination is the target status, and fails when
there is none or more than one.

Create and link require `approved: true`. Create reuses an existing issue
with the same audit id when content matches. Notes keep one comment per audit
id. Link uses the `Blocks` issue-link type; the project must allow that link.

## Where created issues land

Create assigns the new issue, plans it into a sprint, and puts it under its
parent in the same request. Every lookup runs first, so a failed lookup creates
nothing. A replay that reuses an existing issue does not reassign or re-plan
it, because a person may have moved it on purpose. Results report `assignee`
(the display name), `parent`, and, on create, `sprint`.

| Setting | Values | Default |
|---|---|---|
| `assignee` | `me` (the account the credentials belong to), `none`, or an Atlassian account id | `me` |
| `sprint` | `active` (the board's one active sprint), `next` (the board's first future sprint), `none`, or a sprint id | `active` when `board` is recorded, otherwise `none` |

`active` fails when the board has no active sprint or more than one, and names
each sprint so you can record one id instead. A sprint id must be active or
future. The sprint goes into the site's Sprint field. A site without one needs
`sprint=none`.

The create input's `parent` takes an issue key such as `DEL-12`. Use an epic
for a story, or a story for a sub-task. A replay that names a different parent
is refused as conflicting content.

```bash
bun "<skills-dir>/_factory/scripts/delivery-init.ts" --work-items jira --setting board=42
bun "<skills-dir>/_factory/scripts/delivery-init.ts" --work-items jira --setting sprint=next
```

Mapped types are Bug, Story, and Task.

## Configuration

Machine-wide, in the environment:

- `JIRA_SITE` — `https://example.atlassian.net`
- `JIRA_EMAIL` and `JIRA_API_TOKEN`, or `JIRA_TOKEN` as the API token alias,
  or `JIRA_TOKEN_FILE`, or `~/jira-token`

The token file may be `email:token` on one line or email and token on two
lines. Restrict it with `chmod 600`. Needed permissions: browse, create,
comment, and issue link, plus assign issues and schedule issues for placement.
Doctor and installer name a missing site or credentials without printing
secret values.

Per repository, because one machine can serve repositories that file work
items in different projects: the project key, recorded by init in the
repository's `.delivery/work-items.json`. Worktrees of that repository use the
same setting. `JIRA_PROJECT` in the environment is not read.

```bash
bun "<skills-dir>/_factory/scripts/doctor.ts"
bun "<skills-dir>/_factory/scripts/delivery-init.ts" --work-items jira --setting project=DEL
```

A repository can also override the site with `--setting site=<url>`.
Changing a recorded setting needs `--replace`. Until the project is recorded,
doctor reports the Jira work-item provider under Needs setup with the exact
init command, and the bridge refuses to run.

If the host exposes Atlassian or Jira session tools, `/delivery doctor`
records them. Authenticated mappings cover list, read, create, link, and note
without `jira-tracker` on PATH. Session tools pass the parent but cannot assign
or plan a new issue. So create uses `jira-tracker` whenever it is ready, and the
delivery brief names any issue that came back unplaced. Record the site URL with
`--setting site=https://example.atlassian.net`; host tools use it as `cloudId`.
Board moves never use session tools; they run only through `jira-tracker`.
