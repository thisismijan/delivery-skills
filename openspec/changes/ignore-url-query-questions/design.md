## Context

`sectionBody` already drops fenced code. The remaining false positives
are `https://...?...` and backtick spans such as `GET /rows?limit=10`.

## Goals / Non-Goals

**Goals:**

- Complete tickets that only contain those `?` forms skip both draft
  models, same as a ticket with no `?`.

**Non-Goals:**

- Parsing HTML entities or Markdown reference links.

## Decisions

- **Strip inline code, then URLs, then look for `?`.** Order matters so
  a URL inside backticks is removed once.

## Risks / Trade-offs

- [A real question is written inside backticks] → that still uses a
  model only if a `?` remains outside code and URLs.
