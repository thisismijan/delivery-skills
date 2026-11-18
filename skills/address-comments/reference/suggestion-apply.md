# Applying a suggestion fence

Read this in step 6 when an action comment's body is only a suggestion fence
on a new-side line, before dispatching the `implementer` for its fix.

Write that comment to `<reviewDir>/comment-<commentId>.json` and, where step 6
would dispatch the `implementer` for the fix, run instead:
```
bun "${FACTORY_ROOT}/scripts/forge-comments.ts" apply-suggestion "<reviewDir>/comment-<commentId>.json" "<repoRoot>"
```
Non-zero exit → **stop + escalate**. When `apply` is `script`, the helper
already replaced that line, so do not dispatch the `implementer` for it.
Persist that skip with `record-skip.ts` naming `implementer`, then refresh
`routing-scorecard.ts`, even when `routingProfiling` is `off`. The scorecard
counts avoided workers. It never estimates tokens saved. When `apply` is
`model`, continue with the comment's route in step 6. A bug still needs its
red test first, and the green gate, lint, and typecheck still run.
