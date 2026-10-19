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

`jira-tracker` takes `list`, `read`, `create`, `link`, or `note` and a
version-1 JSON envelope on stdin. It talks to Jira Cloud over HTTPS. It does
not transition status or delete issues.

Create and link require `approved: true`. Create reuses an existing issue
with the same audit id when content matches. Notes keep one comment per audit
id. Link uses the `Blocks` issue-link type; the project must allow that link.

Mapped types are Bug, Story, and Task.

## Configuration

- `JIRA_SITE` — `https://example.atlassian.net`
- `JIRA_PROJECT` — project key
- `JIRA_EMAIL` and `JIRA_API_TOKEN`, or `JIRA_TOKEN` as the API token alias,
  or `JIRA_TOKEN_FILE`, or `~/jira-token`

The token file may be `email:token` on one line or email and token on two
lines. Restrict it with `chmod 600`. Needed permissions: browse, create,
comment, and issue link. Doctor and installer name missing site, project, or
credentials without printing secret values.

```bash
bun "<skills-dir>/_factory/scripts/doctor.ts"
bun "<skills-dir>/_factory/scripts/delivery-init.ts" --work-items jira
```
