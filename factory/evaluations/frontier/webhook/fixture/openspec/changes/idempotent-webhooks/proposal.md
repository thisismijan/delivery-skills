## Why

The provider retries deliveries, so the same payment event is sometimes
processed twice and customers are credited or refunded twice.

## What Changes

- Each payment event is processed exactly once, however often it is delivered.
- Charges and refunds are both recorded.
