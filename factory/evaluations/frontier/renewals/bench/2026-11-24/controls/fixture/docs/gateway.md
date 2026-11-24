# Card gateway: charges

`POST /charges` takes `customer`, `amount` (whole minor units), `currency`, and
an `Idempotency-Key` header.

## Results

`status` is one of:

- `succeeded`: the money moved.
- `declined`: the card network refused the charge. Wait at least 24 hours
  before trying the card again.
- `requires_action`: the customer's bank wants the customer to authenticate.
  No money has moved. The charge completes only if the customer authenticates
  within 72 hours; otherwise it expires as `declined`. The gateway reports the
  outcome to the `charge.updated` webhook.

## Idempotency

A request that repeats an `Idempotency-Key` used in the last 7 days is not sent
to the card network. The gateway returns the first request's response
unchanged, whatever its status.

Keys expire 7 days after first use.
