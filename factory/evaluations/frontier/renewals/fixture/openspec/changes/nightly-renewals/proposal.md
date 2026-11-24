## Why

Subscriptions renew only when the customer next visits (`src/renew-on-visit.ts`),
so a customer who stays away keeps using the service unpaid, and renewal days
drift to whenever they happen to come back.

## What Changes

- A nightly job renews every subscription that is due, whether or not the
  customer visits.
- Every customer keeps the same renewal day each month.
- A declined card is retried each night, and the subscription is cancelled
  after seven declined nights.
- A charge the bank wants the customer to authenticate waits for them.
- Renew-on-visit is removed.
