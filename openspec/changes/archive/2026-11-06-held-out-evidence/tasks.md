## 1. Tests

- [x] 1.1 Label three batches of real failed jobs from their logs before running the classifier, and measure it on each.
- [x] 1.2 The two fix sets classify as labelled, the held-out set classifies as labelled apart from its recorded miss, and no set produces a false infrastructure call.
- [x] 1.3 The held-out tests fail against the classifier before this change.
- [x] 1.4 Docs contract: draft, execute, the workers, and the reviewer carry the held-out rule.

## 2. Implementation

- [x] 2.1 Fix the failure-count pattern and add the 50x, TLS reset, proxy abort, and connection reset patterns.
- [x] 2.2 Add the anonymised held-out fixture.
- [x] 2.3 Add the held-out rule to draft, execute, the implementer, the test writer, and the holdout reviewer.
