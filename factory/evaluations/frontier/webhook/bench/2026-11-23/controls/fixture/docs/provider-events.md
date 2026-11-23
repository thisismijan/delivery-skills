# Payment provider events

Every delivery is a POST with the event as the JSON body. The provider signs
the raw body with HMAC-SHA256 and sends the hex digest in `X-Signature`. The
event's own id is the `id` field of the body. `X-Event-Id` is a convenience
copy for logging and is not signed.

| Event type | When |
|---|---|
| `charge.succeeded` | A charge completed |
| `charge.refunded` | A charge was refunded, in full or in part |
| `charge.disputed` | A customer opened a dispute |
