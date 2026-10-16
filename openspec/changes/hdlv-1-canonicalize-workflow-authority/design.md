## Context

Live behaviour is defined by `skills/delivery/SKILL.md`, `workflows/auto.md`, `workflows/delivery-ledger.md` and the current stage specs (`epic-to-backlog.md`, `ticket-to-mr.md`, `mr-review-to-ready.md`, plus the other `workflows/*.md` the conductor routes to). `workflows/NOTES.md` and `workflows/delivery-orchestrator.md` are historical. `delivery-orchestrator.md` already opens with "Historical pointer only", but its body and `NOTES.md` still assert authority (`NOTES.md` "Three stage workflows are source of truth", `delivery-orchestrator.md` "Source of truth for stage behavior remains the three stage files"). In `delivery-specs.test.ts`, `SPECS` loads every `workflows/*.md`, so historical files take part in the ledger-vocabulary, `/Users/` and section loops, and the `~25%` check reads `SPECS["NOTES.md"]`.

## Goals / Non-Goals

**Goals:** one declared live source set; historical files marked non-actionable; contracts independent of historical wording.

**Non-Goals:** any change to lifecycle transitions, review readiness, ledger writes or operator commands; deleting the historical files; rewriting live specs.

## Decisions

1. **Historical set.** Exactly `workflows/NOTES.md` and `workflows/delivery-orchestrator.md` (operator-approved). Current stage specs remain live. The new historical list is a separate constant from the existing `LEGACY_SECTION_EXEMPT`, which also holds the live stage specs, so the two are not merged.
2. **Declaration.** `SKILL.md` "## Source of truth" lists the live files and the historical files and states that historical files are non-actionable and cannot override the conductor, the auto next-step table or the current stage specs. Each historical file opens with a marker line pointing at `SKILL.md`. Existing assertions on that section (no machine-specific fallbacks, `.delivery/`, `routing/`) are kept.
3. **NOTES.md stays as reference.** Other specs link to it ("Terms: see NOTES.md"), so it is kept as a historical record, with its authority and stale-behaviour claims removed or rewritten. Live terms the contracts need (`~25%` sizing) are already in `SKILL.md`, `epic-to-backlog.md` and `ticket-to-mr.md`.
4. **Contracts.** The `~25%` loop drops `SPECS["NOTES.md"]`. The live-contract loops over `SPECS` skip the historical set. One new describe block asserts the declaration and the markers.

## Approved test seams

Two seams, both in the checked-in suite `skills/delivery/checks/delivery-specs.test.ts`.

**Seam A: bundled skill document contract.** Reads `SKILL.md`, `workflows/auto.md` and the stage specs and parses "## Source of truth" through the existing `section()` helper.
- Catches: live set missing or wrong; historical files not marked non-actionable; a live file deferring to a historical one; a historical file reasserting authority (source of truth, three-stage flow, ready MR, Claude-only host).
- Misses: how a future agent behaves when it reads the documents; stale wording in files outside `workflows/`.
- Fake: none.

**Seam B: contract independence from historical wording.** The same suite run against a temporary copy of the skill tree through the existing `DELIVERY_SKILL_ROOT` override (and `DELIVERY_SKILLS_ROOT` for sibling skills).
- Catches: a live contract still reading `NOTES.md` or `delivery-orchestrator.md` (the `~25%` loop, vocabulary and section loops); a new historical file treated as authority.
- Misses: wording quality in live files; contracts that read a historical file by a direct `readFileSync` instead of `SPECS`.
- Controlled fake: a temp directory holding a copy of the live files, with the two historical files contradicted (stale claims, wrong tags, `~50%`). The test runs the suite in a subprocess with `DELIVERY_SKILL_ROOT` set and expects it to pass. It needs the subprocess budget (root `bunfig.toml` preload, or `setDefaultTimeout` at module scope).

Seam A covers the first acceptance criterion and Seam B the second. A phrase-scan seam was rejected as redundant with A.

## Risks / Trade-offs

- Narrowing the `SPECS` loops must not drop live coverage: the stage specs stay in every loop and only the two historical files are skipped.
- The copy used by Seam B must include the sibling skills the suite reads (`code-review-max`, `mr-review`, pack `README.md`, `install.sh`) or point `DELIVERY_SKILLS_ROOT` at the real ones.
- Complexity is recorded as low in `.ig-spec.json`.
