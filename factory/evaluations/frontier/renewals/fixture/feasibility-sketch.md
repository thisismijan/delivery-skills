Approach sketch: a nightly job on the existing scheduler that charges due subscriptions and moves `renewsAt` on a month. The gateway's idempotency keys make reruns and retries safe. Low risk.
