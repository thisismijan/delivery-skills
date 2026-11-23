## Approach

Add `src/rate-limit.ts` with a module-level `Map<string, { count: number; windowStart: number }>`.
In `src/server.ts`, after `authenticate`, call `allow(user.id)` and answer 429 when it returns false.
`allow` increments the count for the key and resets it when 60 seconds have passed since `windowStart`.

## Alternatives considered

- A shared store such as Redis: rejected as an extra service to run.
