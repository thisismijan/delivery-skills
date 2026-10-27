## Context

Groom already fails closed on drafts that fail `verify-ticket.ts`. It
does not run that check on the incoming idea, so a paste of a complete
ticket still pays for exploration and grilling.

## Goals / Non-Goals

**Goals:**

- No explorer or grilling when the input already passes the ticket
  verifier.
- Keep operator approval before any draft is written.

**Non-Goals:**

- Skipping the writer. Approval still emits through the existing path.
- Treating a near-miss ticket as valid. A failed check uses the full
  groom path so missing sections can be filled.

## Decisions

- **Write the input to the output directory first.** The verifier
  accepts a file path. Persist `source.md` so the check is replayable.
- **A pass is a single ticket.** Do not invent a split from a document
  that already verified as one story and at most three criteria.
- **A fail is not a stop.** Raw ideas fail the verifier; that is the
  explorer path.

## Risks / Trade-offs

- [A valid-looking ticket still names the wrong module] → approval and
  `/draft` still judge the content; this skip only avoids rediscovering
  structure that is already present.
