## Context

Gather already drops system notes and factory-handled threads. Resolved
is already on the normalized discussion and note. Empty bodies already
arrive as strings.

## Goals / Non-Goals

**Goals:**

- No assessor input for a resolved discussion, a resolved note, or an
  empty body.
- Keep unanchored and old-side comments in scope when they have text
  and are unresolved.

**Non-Goals:**

- Treating "LGTM" as empty. That still needs a classifier.
- Marking threads resolved. The factory still never resolves.

## Decisions

- **Resolved is excluded, not outdated.** It is finished work, like a
  handled thread. Empty bodies are outdated so the skip count records
  them.
- **Whitespace-only is empty.** Trim before the check.

## Risks / Trade-offs

- [A provider marks a live thread resolved by mistake] → the factory
  does not re-action it; a human can unresolve and re-run.
