## 1. Tests first: representative evidence

- [x] 1.1 Write failing tests that mixed live and representative-run scores do not meet the five-sample bar, that live-only scores count as zero, and that a different candidate's scores are ignored
- [x] 1.2 Write a failing test that unscored representative fixtures do not clear dispatch or promotion

## 2. Tests first: quality bar

- [x] 2.1 Write failing tests that four representative-run scores, a mean below 90 percent, an 89 percent mean, or any critical miss keep the candidate evaluation-only
- [x] 2.2 Confirm the existing 90 percent dispatch test still expects the bar at 0.9 and still fails closed below it

## 3. Tests first: safety floors

- [x] 3.1 Write failing tests that auth, migration, concurrency, distributed-state, weak-verification, and holdout tasks are refused, each with the floor named in the reason
- [x] 3.2 Write a failing test that a named floor still blocks after five representative-run scores at or above 90 percent with no critical misses

## 4. Tests first: promotion approval

- [x] 4.1 Write failing tests that clearing evidence without an approval, or with an approval for another candidate, leaves catalogue availability evaluation-only
- [x] 4.2 Write a failing test that public rankings do not promote, and that an exact operator promotion approval plus clearing representative-run evidence can mark only that candidate live

## 5. Implementation

- [x] 5.1 Count only representative-run exact-candidate scores in `evaluateFastDispatch` and keep the five-sample, 90 percent, and zero-miss bars
- [x] 5.2 Add `namedSafetyFloor` and refuse listed task kinds from fast dispatch even when the quality bar has cleared
- [x] 5.3 Add `evaluatePromotion` and `applyFastPromotion` so live availability is unchanged without an exact named-candidate approval
- [x] 5.4 Update `factory/RUNTIME.md`, `README.md`, `skills/delivery/SKILL.md`, `skills/execute/SKILL.md`, and the wording contracts so they require representative-run evidence, named floors, and operator promotion approval
- [x] 5.5 Run `bun test` in `factory/` and `bun run check` there, and confirm they pass
