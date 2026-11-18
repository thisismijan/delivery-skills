# Mechanical-edit units for an action comment

Read this in step 6 when a `bug` or `non-functional` comment names a bounded
rename, import-only, or format-only change, before dispatching the
`implementer` for its fix. For a `bug`, the red gate has already run.

Write the plan to `<reviewDir>/mechanical-edit-<commentId>.json` and classify it:
```
bun "${FACTORY_ROOT}/scripts/apply-mechanical-edit.ts" "<reviewDir>/mechanical-edit-<commentId>.json" "<repoRoot>"
```
Incomplete or free-text comments are not a unit. Persist the JSON plan. The
units it proves are listed in `$FACTORY_ROOT/reference/mechanical-edit.md`;
the helper's verdict decides. When `apply` is `script`, the helper already
wrote the files. Persist that skip with `record-skip.ts` naming `implementer`,
then refresh `routing-scorecard.ts`. The scorecard counts avoided workers. It
never estimates tokens saved. Otherwise dispatch the worker step 6 names for
that class. Either way, the green gate, lint, and typecheck still run, and the
formatting, spec, and commit rules of step 6 still apply.
