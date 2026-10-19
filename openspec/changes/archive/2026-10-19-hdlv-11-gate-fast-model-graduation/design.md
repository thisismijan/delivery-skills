## Context

`evaluateFastDispatch` in `factory/scripts/fast-dispatch.ts` already requires an exact candidate, five scored reversible samples, a 90 percent mean, and zero critical misses. It still pools `live` and `representative-run` scores, does not name the safety floors, and never talks to catalogue availability. HDLV-7's `buildPromotionReport` already groups those sources separately. `isFastEligible` does not look at domains or holdout review, so an otherwise mechanical auth search can still look dispatchable. Catalogue `availability` is `evaluation-only` for every fast candidate in `factory/model-catalogue.json`. Complexity signal: medium.

## Goals / Non-Goals

**Goals:**
- Count only representative-run scores for the exact candidate.
- Name and apply the six safety floors on dispatch.
- Keep live availability unchanged without an exact operator promotion approval.

**Non-Goals:**
- Lowering the 90 percent bar, or treating rankings as evidence.
- Computing utility from raw model output.
- Auto-writing the bundled catalogue in this change. Promotion returns a new catalogue value; committing a live mapping remains an operator edit.

## Decisions

### Approved test seams

All seams are pure functions in `factory/scripts/fast-dispatch.ts`, tested with `bun test`. Preference was given to the existing dispatch function and one promotion helper beside it.

1. **`evaluateFastDispatch(entries, profile?, candidateModel?)`** (extends the current gate).
   - Counts only entries whose `observation.source` is `representative-run`, whose evaluation names `candidateModel`, and whose profile is fast-eligible.
   - When `profile` is supplied, a named safety floor on that task refuses dispatch even if the quality bar has cleared.
   - Catches: mixed live and representative samples treated as five; live-only samples treated as enough; a different candidate's scores counted; a listed task kind dispatched after the bar clears.
   - Misses: whether stored utility numbers are meaningful. That stays with scoring, not this gate.
   - Controlled fakes: corpus entries built with `scoreCandidate` / `corpusEntryFrom` and a fixed `source`; hand-written task profiles. No network, models, clock, or randomness.

2. **`namedSafetyFloor(profile)`** returns one of `auth`, `migration`, `concurrency`, `distributed-state`, `weak-verification`, `holdout`, or `null`.
   - Domain floors match `ALWAYS_FRONTIER_DOMAINS` in `shadow-route.ts`. Holdout is review work on the existing holdout stages (`execute`, `address`, `review`, `ship`). Weak verification matches `verificationStrength === "weak"` even when the rest of the profile looks mechanical.
   - When several floors apply, the first name in that list is the one reported, so the reason is deterministic.
   - Catches: each listed kind; a floor that still blocks after five good representative scores.
   - Misses: whether a human labelled the profile honestly.

3. **`evaluatePromotion(entries, candidateModel, approval?)`** and **`applyFastPromotion(catalogue, verdict)`**.
   - Evidence uses the same representative-run, exact-candidate, five-sample, 90 percent, zero-miss rule as dispatch, without a task profile.
   - `approval` is `{ candidateModel }` for that exact id, or absent. Rankings passed beside the corpus are ignored.
   - `evaluatePromotion` returns `availability: "evaluation-only"` unless evidence cleared **and** the approval names this candidate. `applyFastPromotion` copies the catalogue and changes that candidate's fast-tier availability only when the verdict says `live`. The input catalogue is not mutated.
   - Catches: clearing evidence without approval; approval for another candidate; rankings-only input; unscored representative fixtures; a successful apply that leaves other candidates evaluation-only.
   - Misses: whether an operator later commits the returned catalogue. That is a human edit, not this helper.

**What the seams miss together:** live usage after a human commits a live mapping; whether every skill calls the helper before resolving a fast model.

### Dispatch versus availability

`evaluateFastDispatch.allowed` is whether this task may use the fast candidate. Catalogue `availability` is a separate value. Evidence can clear for reversible search work while every fast candidate stays `evaluation-only` until `applyFastPromotion` sees an exact approval. Live delivery still cannot resolve an evaluation-only model.

### Alternatives considered

- Pool live and representative-run once the report already separates them: rejected, the ticket forbids mixed evidence.
- Flip bundled `model-catalogue.json` from tests: rejected, fixtures and rankings must not enable a fast model.
- Require approval inside `evaluateFastDispatch`: rejected, the ticket splits dispatch floors from availability.

## Risks / Trade-offs

- Existing tests that score representative-run search work and expect `allowed: true` stay valid; tests that implied mixed sources were enough must fail until the filter lands. Mitigation: add explicit mixed-source and live-only cases rather than weakening the 90 percent assertion.
- A mechanical auth search currently looks fast-eligible. Mitigation: named floors run before the quality bar, and the reason names the floor.
- An operator approval object could be forged in a unit test. Mitigation: the helper only treats `{ candidateModel }` as approval; it does not invent one from rankings, fixtures, or a cleared bar.
