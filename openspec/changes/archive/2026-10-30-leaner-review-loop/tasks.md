## 1. Tests

- [x] 1.1 Prove review-scope returns delta only for a small change inside reviewed files, and full with reasons for every other case, on real repositories.
- [x] 1.2 Prove approach-challenge routing, verdict consistency, attempt bounds, and the exit codes.
- [x] 1.3 Prove address-comments dispatches no holdout, code-review-max and mr-review name the scope step, draft names the challenge, and the constitution stops changed.

## 2. Implementation

- [x] 2.1 Remove the address-comments holdout; keep the cumulative gates and the draft-only outcome.
- [x] 2.2 Add `review-scope.ts` and the delta path in code-review-max and mr-review.
- [x] 2.3 Add the approach-challenger agent, its verdict, routing, and the draft step.
- [x] 2.4 Update the constitution stops, docs, README, and reference.
