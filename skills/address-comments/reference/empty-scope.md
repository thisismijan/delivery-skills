# No comments in scope

Read this in step 5 when scoping left no in-scope comments, so the
`comment-assessor` is not dispatched.

Write `<reviewDir>/skipped-workers.json` naming `comment-assessor` and persist
it even when `routingProfiling` is `off`:
```
bun "${FACTORY_ROOT}/scripts/record-skip.ts" persist "<repo>/.delivery/routing" "<changeName>" "<reviewDir>/skipped-workers.json"
bun "${FACTORY_ROOT}/scripts/routing-scorecard.ts" "<repo>/.delivery/routing" "<changeName>"
```
The scorecard counts avoided workers. It never estimates tokens saved. Keep
`classification.json` as the scripted outdated verdicts, or `[]` when there
were none, then continue at step 6.
