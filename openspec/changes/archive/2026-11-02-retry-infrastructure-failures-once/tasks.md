## 1. Tests

- [x] 1.1 Classify each recorded failed job and match its expected kind: every runner failure behind the run's infrastructure stops is infrastructure, the test-job timeout is a test failure, and the formatting error is not infrastructure.
- [x] 1.2 Gate: retry a first infrastructure failure; stop on a repeat, a test failure, a mixed pipeline, a deploy job, no policy, a failed contract check, or stale evidence; re-add a failed train once.
- [x] 1.3 Provider: retry calls `failures` then the adapter with exactly the gated jobs, honours dry runs and approval, refuses a mismatched receipt, and never runs through session tools.
- [x] 1.4 GitLab adapter: failed jobs with retries counted, train attempts, missing logs, head guards, and both retry forms.
- [x] 1.5 Docs contract: the workflow's retry input matches the input schema, and auto asks for the policy once.

## 2. Implementation

- [x] 2.1 Add the classifier and the retry gate.
- [x] 2.2 Add `failures` and `retry` to the forge provider, with `retry` adapter-only.
- [x] 2.3 Add `ciRetry` to the run contract.
- [x] 2.4 Implement both operations in the GitLab adapter, with a plain-text request for job logs.
- [x] 2.5 Update the pipeline-monitoring and auto workflows and the operation docs.
