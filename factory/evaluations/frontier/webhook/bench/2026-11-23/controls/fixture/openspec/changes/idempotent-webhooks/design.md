## Approach

Add a `processed_events` table and load its ids into an in-memory `Set` at
startup. In `src/webhook.ts`, before running the handler, skip the job when
`job.eventId` is in the set. After the handler finishes, insert the id into the
table and add it to the set.

Event types without a handler are acknowledged and recorded as processed, so
the provider stops retrying them.

## Alternatives considered

- A unique constraint and insert-first in one transaction: rejected as more
  database work on every delivery.
