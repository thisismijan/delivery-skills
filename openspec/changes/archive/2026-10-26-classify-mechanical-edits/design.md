## Context

See proposal.md for motivation. Live dispatch today is `select-model` (Sonnet
or Opus) plus catalogue resolution. Fast models are evaluation-only.
`isFastEligible` allows only search, classify, and summarise. Implement and
write-tests have a standard floor. Holdout must not fail naming nits;
address-comments disputes nitpicks without editing code. Review fan-out is
the existing pattern for a fail-closed, non-LLM classifier.

## Goals / Non-Goals

**Goals:**
- Classify a structured mechanical-edit before any apply dispatch.
- Prefer a scripted rename/import/format apply when the language can prove it.
- Make classified mechanical-edit fast-eligible for shadow scoring only.

**Non-Goals:**
- Swapping model inside one implementer tool loop.
- Letting a worker declare its own work menial.
- Promoting Haiku or any fast candidate to live.
- Turning holdout naming nits into mechanical-edit units.

## Decisions

### Structured payload, not finding strings

Holdout `findings` are free-text arrays. Regex on those strings would both
over-accept ("rename the public API") and under-accept. The classifier takes
a small JSON object: operation, from, to, files, reversible, surfaces,
verification. Incomplete input is `not-mechanical`. Same fail-closed shape as
`review-fanout.ts`.

### Command classifies; worker never does

Execute and address-comments call the helper before dispatch. The profile
controller may still emit `mechanical-edit` when profiling is on, but live
routing does not trust that alone. A cheaper model must not judge whether a
stronger one is needed.

### Script first, model later

An identifier rename that a language server or AST refactor can apply should
not pay Haiku. The first apply path is a script when one exists. If none
exists, live dispatch stays on `select-model` even when the unit is
mechanical. Fast dispatch remains behind graduation.

### Mechanical-edit is a work type, not a secret implement

Add `mechanical-edit` to the task-profile work-type enum. Fast eligibility
includes it when the existing reversible/local/known-pattern/strong-verification
conjunction holds. The implement/write-tests standard floor stays. Named
safety floors still win.

### Comment-fix is the first recording site

Address-comments already has a separate fix loop. When a human comment is
`bug` or `non-functional` and the command can fill a complete mechanical-edit
payload, it classifies and records. Nitpick remains dispute-only. Execute
records "no unit" for ordinary implement so the absence is explicit.

### Alternatives considered

- Mid-session model swap: hosts do not cheaply change model inside one
  implementer call; classification error dominates the save.
- Frontier classifier per rename: a frontier call to save a fast call loses
  money.
- Live Haiku in this change: violates fast-model-graduation.

## Risks / Trade-offs

- [Few units classify as mechanical] → That is acceptable. The helper is
  conservative. Savings come later from scored representative runs, not from
  stretching the definition.
- [Scripted rename unavailable for a language] → Fall back to today's
  standard worker; do not invent a half-refactor.
- [Someone fills a payload that hides a contract change] → Surfaces include
  contract/auth/infra; any of those forces `not-mechanical`.
- [Operators expect Haiku on day one] → Docs and contracts state
  evaluation-only until promotion.

## Migration Plan

Ship the helper and contracts. Existing runs with no payload keep current
workers. No catalogue availability change. Rollback is revert; no stored
state besides optional classification JSON under the review directory.

## Open Questions

None that block this slice. Which languages get a scripted rename first can
be chosen at implementation (TypeScript AST is the obvious first, others
fall back).
