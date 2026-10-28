## Context

`hasOpenQuestion` already drops URLs, inline code, and fenced code. A
ticket that says `timeout?: number` still contains a `?`.

## Goals / Non-Goals

**Goals:**

- Ignore `?:`, `?.`, and `??` when deciding whether a ticket asks a
  question.

**Non-Goals:**

- Parsing a full language grammar.
- Treating a spaced ternary `cond ? a : b` as syntax. That still uses
  the models.

## Decisions

- **Strip those three tokens after URLs and inline code.** A leftover
  `?` is still an open question.

## Risks / Trade-offs

- [A product question is written as `ready?:`] → that form is rare in
  the scoped sections; operators can still write `ready?`.
