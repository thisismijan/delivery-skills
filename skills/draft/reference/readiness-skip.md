# A readiness skip that will not persist

Read this at step 7c when persisting the low-complexity skip for `first-pass-reviewer` exits non-zero.

When persisting exits 1 with exactly `skip id already recorded:
first-pass-reviewer-<work-item-key>`, an earlier draft of this work item
recorded it, so treat the skip as already recorded and continue to step 8.
Never invent or use a different skip id. Any other persist failure: stop the
draft.
