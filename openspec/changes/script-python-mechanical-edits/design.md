## Context

See proposal.md. TypeScript renames use the language service.
Python has no equivalent in the factory pack. CPython is on PATH in this
environment and in typical target images. The tokenizer skips strings and
comments. The AST counts function and class definitions.

## Goals / Non-Goals

**Goals:**
- Apply a Python function or class rename without a model when the graph is
  complete.
- Fail closed with no writes otherwise.

**Non-Goals:**
- Import-only or format-only Python.
- Java in this change.
- Live fast-model promotion.

## Decisions

### CPython tokenizer, not a JS parser

A JavaScript Python parser would drift from the language. The helper spawns
`python3` and uses `tokenize` plus `ast`. Missing Python or invalid JSON is
`select-model`.

### Exactly one definition

Two functions or classes that share the source name are ambiguous. Uses
without a listed definition are incomplete. Both refuse.

## Risks / Trade-offs

- [python3 missing on a host] → Fall back to today's worker.
- [untokenize rewriting whitespace] → Offsets are applied on the original
  source instead of untokenize.

## Migration Plan

Ship the helper. Non-Python units are unchanged. Rollback is revert.

## Open Questions

None.
