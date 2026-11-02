## 1. Tests

- [x] 1.1 Prove usernames, comment times, and events from GitLab system notes and the GitHub timeline, and that a timeless note drops the events.
- [x] 1.2 Prove the settle decision: unanswered, approval after reply, window from ready, push, or comment, quiet hours, and every ask case.
- [x] 1.3 Replay the MDF-3212 merge requests at the moment each was queued.
- [x] 1.4 Prove the land gate waits, stops, or lands on the settle decision, and the docs name the knobs and command.

## 2. Implementation

- [x] 2.1 Add comment times and review events to the forge schema and both adapters; report GitLab usernames.
- [x] 2.2 Add `reviewer-settle.ts`, `quiet-hours.ts`, and the config knobs.
- [x] 2.3 Run the check in the land gate and document it in auto, readiness, the reference, the README, and the GitLab provider notes.
