# Why a script skips the assessor or the analyst

Read this at step 2 or step 4 when you need to know why `skipAssessor` or `skipAnalyst` came out as it did, for example to explain it to the operator. The script's answer still decides.

## Ticket assessor (step 2)

Recorded blockers skip the assessor even when the body is otherwise valid. A
complete ticket with no question mark in Context, User stories, What to build,
or Acceptance criteria copies a scripted good verdict. A size warning skips the
assessor as too large. A question still uses the assessor. A question mark in a
URL, inline code, or optional syntax does not count.

## Feasibility analyst (step 4)

A complete ticket with no question mark
and no named authentication, authorization, secrets, credentials,
OAuth, OIDC, JWT, or data, schema, or database migration copies a scripted
feasible verdict at medium complexity. A question still uses the analyst. A
question mark in a URL, inline code, or optional syntax does not count.
