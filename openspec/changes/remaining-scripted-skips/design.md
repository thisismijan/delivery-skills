## Context

The remaining cheap skips were leftovers from earlier changes: `.js`
files used the TypeScript apply path except for the extension check,
stacked acks failed because the matcher required the whole body to be
one phrase, and the feasibility scan listed only authentication,
secrets, and data migration.

## Goals / Non-Goals

**Goals:**

- Apply proven JavaScript mechanical units by script.
- Treat a body of only known acknowledgements as outdated.
- Escalate named authorization and token-protocol work without an
  analyst.

**Non-Goals:**

- Skipping holdout, Composer, or a suggestion that has extra prose.
- Filling Context or User stories as housekeeping.
- Adding concurrency to the analyst skip; that still needs a model.

## Decisions

- **JavaScript uses the TypeScript apply path.** The compiler already
  parses `.js` and `.jsx`.
- **Every token must be an acknowledgement.** Extra prose stays in
  scope.
- **Match the analyst escalate list.** Authorization, credentials,
  OAuth, OIDC, JWT, and schema or database migration join the existing
  names. Mentions in Out of scope still do not count.

## Risks / Trade-offs

- ["Do not change OAuth" in What to build] → still escalates. Fail
  closed.
