# Jira tracker provider

Selected with `./install.sh --skills-dir <path> --provider jira`.

Setup installs `jira-tracker` into `${DELIVERY_BIN_DIR:-$HOME/.local/bin}`
and advertises it as `exec:<absolute-path>` with `provider: "jira"` for
`tracker.item`. Delivery still confirms that provider on first use; installing
this package does not infer Jira from credentials or issue keys.

`jira-tracker` takes one operation argument (`list`, `read`, `create`, `link`,
or `note`) and a version-1 JSON request on stdin. It talks to Jira Cloud over
HTTPS, reads site, project, and credentials from the environment or a file
(never argv), and prints versioned normalized work items. It does not
transition status or delete issues.

Create and link require `approved: true`. Create reuses an existing issue with
the same audit id when the content matches. Notes keep one comment per audit
id.

Work-item capabilities become available only when `jira-tracker`, `bun`,
`JIRA_SITE`, `JIRA_PROJECT`, and a credential are present.

Provide Cloud configuration with:

- `JIRA_SITE` - `https://example.atlassian.net`
- `JIRA_PROJECT` - project key
- `JIRA_EMAIL` and `JIRA_API_TOKEN`, or `JIRA_TOKEN_FILE`, or `~/jira-token`

The token file may be `email:token` on one line or email and token on two
lines. Installer and provider status name missing site, project, or
credentials without printing secret values. Selecting this provider does not
create or change Jira issues by itself. Confirm it as the repository
work-item provider on first use, then run:

```bash
bun "<skills-dir>/_factory/scripts/doctor.ts"
```
