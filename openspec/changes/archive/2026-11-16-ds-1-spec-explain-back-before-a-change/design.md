## Context

`/draft` already fail-closes on assessment, feasibility, and approach challenge. Nothing asks a fresh session whether the authored OpenSpec change stands alone. This design adds that check using the same isolate-and-route pattern as approach challenge.

## Goals / Non-Goals

- Goals: catch missing context before verify; one revision then escalate; fail closed on bad verdicts; isolate the reader from ticket and decisions
- Non-Goals: readiness (separate ticket); skipping for low complexity; retrying malformed verdicts; changing holdout

## Decisions

- **Seam:** extend `draft-route.ts` with a `comprehension` mode and a strict verdict schema in `verdicts.ts`, plus a read-only agent under `factory/agents/`. Prefer this over a new top-level script so routing, attempt bounds, and exit 3 stay one place.
- **Verdict values:** `understood` (non-empty restatement), `gaps` (non-empty list), `misread` (named contradiction with the change files). Empty or contradictory shapes fail closed. The draft command marks misread by comparing restatement to change files; the reader never sees the work item.
- **Placement:** after approach challenge (7a), before `verify-change` (8). Still runs when 7a was skipped for low complexity.
- **Tier:** standard model for the reader (comprehension, not design judgment).
- **Attempts:** max 2, same as approach challenge. A revision regenerates `tasks.md` and keeps isolated inputs.
- **Inputs to the reader:** only `openspec/changes/<change>/` (excluding change metadata that carries the work-item key) and repository files the design or specs reference. Never the work item, `decisions.md`, grilling history, or `.review/draft-*`. A denied-path read is a gap.
- **Stop id:** add `unsettled-comprehension` to constitution draft stops.

## Test seam

- Primary: unit tests of verdict parse and `routeComprehension` attempt bounds and actions
- Contract: `workflow-contracts.test.ts` asserts the draft skill names the step, isolation rule, and route invocation
- What it catches: wrong routing, malformed verdicts accepted, missing skill wiring
- What it misses: live model quality of restatements (left to holdout and later runs)

## Risks / Trade-offs

- Extra draft latency on every ticket; accepted because the check is cheap relative to a wrong build
- False gaps if the reader is too strict; mitigated by one revision and human escalate

## Migration Plan

None. Behaviour starts on the next `/draft` after merge.
