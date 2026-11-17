## Context

See proposal.md. `mechanical-edit.ts` classifies a structured unit and
returns `apply: script` only when the payload sets `scriptedApply`. Execute
and address-comments currently trust that flag. No helper rewrites source.
Live dispatch stays on `select-model`. Fast models stay evaluation-only.

## Goals / Non-Goals

**Goals:**
- Apply a TypeScript identifier rename without a model when the language
  service can prove the graph is complete.
- Fail closed with no writes when it cannot prove that.
- Keep import-only and format-only on today's worker until they have a
  proven script.

**Non-Goals:**
- Live Haiku or any fast-model promotion.
- Python, Java, or other languages.
- Import sorting or formatter-only patches.
- Mid-session model swap.

## Decisions

### Language service, not text replace

A word replace would rewrite strings and comments. `findRenameLocations`
rewrites identifiers and import aliases, and it reveals references outside
the listed files. That incomplete graph is a refusal, not a partial edit.

### One symbol, unused target

Several bindings that share the source name are ambiguous. A target name
that already exists in a listed file is a clash. Both refuse and write
nothing.

### Apply command is the proof

The apply helper classifies, then attempts the script. `apply: script` in
its JSON means it already wrote. Skills call that helper and must not skip
the implementer because a payload flag claimed a script exists.

### TypeScript is a runtime dependency

The installed factory pack has to run the helper. `typescript` moves from
dev-only to a production dependency.

## Risks / Trade-offs

- [No tsconfig in the target repo] → Build a program from TypeScript files
  under the root, still refuse an incomplete graph.
- [Large program startup] → Acceptable for a bounded rename; do not skip
  the graph check to save time.
- [Import-only and format-only stay on Sonnet] → That is the conservative
  gap this slice does not pretend to close.

## Migration Plan

Ship the helper and skill wiring. Units that cannot prove a rename behave as
they do today. Rollback is revert.

## Open Questions

None.
