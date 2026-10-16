## 1. Tests first: scoring

- [ ] 1.1 Write failing tests for `scoreCandidate`: exact candidate and task class recorded, two candidates stay distinct, out-of-range utility and critical misses refused
- [ ] 1.2 Write a failing test that a stored evaluation without a task class still parses

## 2. Tests first: promotion report

- [ ] 2.1 Write failing tests for `buildPromotionReport`: live and representative-run reported separately, different candidates and task classes not combined, unscored entries not counted

## 3. Tests first: persistence

- [ ] 3.1 Write failing tests that persisting with a missing or invalid outcome fails and writes nothing, and that an explicit failing outcome is stored unchanged
- [ ] 3.2 Write a failing test that `record-routing persist` without an outcome file exits nonzero and writes nothing

## 4. Implementation

- [ ] 4.1 Implement `scoreCandidate` and the optional task class on the evaluation in `factory/scripts/evaluation-corpus.ts`
- [ ] 4.2 Implement `buildPromotionReport` grouping by candidate, task class and source
- [ ] 4.3 Require a validated outcome in `buildObservation`, `persistObservation` and the `record-routing` command line; remove the default success
- [ ] 4.4 Audit and update `representative-routing-runs.ts`, the skills and `factory/RUNTIME.md` so every caller supplies an explicit outcome
- [ ] 4.5 Run `bun test` in `factory/` and confirm all tests pass
