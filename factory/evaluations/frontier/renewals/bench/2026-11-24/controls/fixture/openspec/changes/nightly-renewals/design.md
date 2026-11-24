## Approach

Add a `renewals` job to the existing scheduler (`src/jobs/schedule.ts`). Each
night it:

1. Loads the due subscriptions with `SubscriptionStore.dueForRenewal(now)`.
2. Charges each one with `gateway.charge`, using the idempotency key
   `renewal:<subscription id>:<renewsAt as YYYY-MM-DD>`. If the job crashes
   after a charge and before the save, the next run sends the same key, so the
   customer is not charged twice.
3. If the result is `declined`, leaves `renewsAt` unchanged so the next night
   retries it, and counts the decline; at seven, cancels the subscription.
   Otherwise sets `renewsAt` to `addMonths(renewsAt, 1)`.
4. Saves the subscription.

Renewing from `renewsAt`, not from the night the job runs, keeps each customer
on the same day of the month even when a run is late.

## Not changing

- The scheduler and how it makes sure a job runs once a night.
- `pause` and `resume` in `src/pause.ts`.
- Money handling in `src/money.ts`.
