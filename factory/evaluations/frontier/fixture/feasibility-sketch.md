Approach sketch: an in-memory counter per user id in a new `src/rate-limit.ts`, checked in `src/server.ts` right after authentication. Low risk; no new dependencies.
