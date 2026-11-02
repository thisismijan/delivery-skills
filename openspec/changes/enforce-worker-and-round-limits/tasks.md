## 1. Tests

- [x] 1.1 Prove the cap refuses a fifth worker, dispatches only the room left, refuses a running key, and ignores finished workers, from the command line too.
- [x] 1.2 Prove a fourth round is refused at standard, allowed after a recorded approval for that round, and refused again at five.
- [x] 1.3 Pin that a push after GO stops the land gate and leaves release readiness without a current review.

## 2. Implementation

- [x] 2.1 Add `finishedAt`, `liveWorkers`, and the live count to `ready-wave`.
- [x] 2.2 Add the round cap and `allow` to `review-rounds.ts`.
- [x] 2.3 Document the caps in auto, address-comments, and the reference.
