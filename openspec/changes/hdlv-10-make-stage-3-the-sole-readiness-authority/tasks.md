## 1. Tests first: dual-review helper

- [ ] 1.1 Write a failing test that matching max-pass and approach-pass artifacts with no blockers return ready
- [ ] 1.2 Write failing tests that missing, stale, or malformed artifacts return stay-draft
- [ ] 1.3 Write failing tests that blocking max-pass or approach-pass evidence returns stay-draft, and that a conductor-written ready row without those artifacts cannot make the decision ready

## 2. Tests first: addressed resume and contracts

- [ ] 2.1 Write a failing test that a bare key at `[addressed !N]` selects review, not address comments
- [ ] 2.2 Write failing wording tests that address-comments holdout approve leaves the merge request draft and sets `[addressed !N]`, and that ship does not treat a review row alone as Stage 3 having passed

## 3. Implementation

- [ ] 3.1 Implement `decideStage3Readiness` in `factory/scripts/stage3-readiness.ts` and confirm the helper tests pass
- [ ] 3.2 Add `[addressed !N]` to the ledger, auto next-step table, and status-tag regex, and confirm the resume test passes
- [ ] 3.3 Update address-comments, the conductor, release readiness, and factory address-comments spec so holdout does not undraft and only the helper may, and confirm the wording tests pass
- [ ] 3.4 Run `bun test` in `factory/` and `bun run check` there, plus delivery-specs, and confirm they pass
