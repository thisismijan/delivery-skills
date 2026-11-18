# Recording a review with no lenses

Read this when the fan-out result's `lenses` array is empty.

Do not dispatch review-lens subagents. Run the coverage command with no reports
so the skip is recorded. Write `.review/mr-<iid>/skipped-workers.json` naming
`review-lens` and persist it even when `routingProfiling` is `off`:
```
bun "${FACTORY_ROOT}/scripts/record-skip.ts" persist "<repo>/.delivery/routing" "review-mr-<iid>" ".review/mr-<iid>/skipped-workers.json"
bun "${FACTORY_ROOT}/scripts/routing-scorecard.ts" "<repo>/.delivery/routing" "review-mr-<iid>"
```
The scorecard counts avoided workers. It never estimates tokens saved.

The coverage result then has the status `skipped`, which means no lens ran. Go
to adjudication with no candidates. It adds no second skipped-worker entry,
because the skip is already recorded for `review-lens`.
