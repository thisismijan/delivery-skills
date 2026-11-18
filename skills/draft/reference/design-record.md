# Design record above low complexity

Read this at step 5a when the feasibility `complexitySignal` is `medium` or `high`.

When `complexitySignal` is `high`, the checkpoint must also show a small
**usage sketch**, a **type or signature sketch**, and at least one **rejected
alternative** with the reason it loses. Persist these in `design.md` after
selection.

**Rejected alternatives.** When `complexitySignal` is `medium` or `high`,
`design.md` has a `## Rejected alternatives` section. List each material option
not taken, with the one-line reason it loses: the seams not chosen at the
checkpoint, any alternative the approach challenger named, and any option the
grooming decisions log rejected for this ticket. The holdout reviewer fails a
diff that implements one of them, so an implementer cannot drift back to a
design that was already turned down. A low-complexity change may leave the
section out.
