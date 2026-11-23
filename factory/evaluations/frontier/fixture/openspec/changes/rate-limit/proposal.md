## Why

Clients can hammer the API. We need a per-client request limit.

## What Changes

- Every request is counted against a limit of 100 requests per minute.
- A client over the limit gets HTTP 429 until the minute is over.
