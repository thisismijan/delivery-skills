## Context

Haiku scoring used an advertised slug the host accepted, while results
still recorded catalogue id `haiku`. Composer has no such slug here:
`--model composer-1` is refused, and the IDE catalogue omits it.

## Goals / Non-Goals

**Goals:**

- Fail closed before ingest when the host cannot dispatch the candidate.
- Keep Composer evaluation-only until all six fixtures have a real
  candidate arm with host tokens.

**Non-Goals:**

- Guessing a Composer alias.
- Promoting Composer.
- Changing Spark or Haiku availability.

## Decisions

- **Dispatch is the host accepting the exact id.** Resolve against
  inventory can still return `composer-1` while the worker CLI rejects
  it. Capture notes say to prove the host accepts `--model <id>` (or the
  runtime equivalent) before the candidate arm.
- **No stand-in for a refused model.** Copying a Spark or Haiku tree, or
  inventing tokens, is refused the same way as the existing stand-in
  rewrite.

## Risks / Trade-offs

- [A later host advertises a different Composer slug] → register that
  exact id; do not treat it as `composer-1` scores.
