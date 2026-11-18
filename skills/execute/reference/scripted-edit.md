# Scripted mechanical-edit units

This applies when a change (step 3b) or an implementer dispatch (step 7) is a bounded rename, import-only, or format-only unit.

## Before the test writer

Write `<reviewDir>/mechanical-edit.json` and apply it before any test-writer:
```
bun "${FACTORY_ROOT}/scripts/apply-mechanical-edit.ts" "<reviewDir>/mechanical-edit.json" "<repoRoot>"
```
Incomplete or free-text findings are not a unit. Persist the JSON plan.
The units the helper can prove, by language, are listed in
`$FACTORY_ROOT/reference/mechanical-edit.md`; the helper's verdict decides.
When `apply` is `script`, the helper
already wrote the files. Do not dispatch the `test-writer` or the
`implementer`. Do not run a red gate. Write
`<reviewDir>/skipped-workers.json` naming those two workers and persist
even when `routingProfiling` is `off`:
```
bun "${FACTORY_ROOT}/scripts/record-skip.ts" persist "<repo>/.delivery/routing" "<changeName>" "<reviewDir>/skipped-workers.json"
bun "${FACTORY_ROOT}/scripts/routing-scorecard.ts" "<repo>/.delivery/routing" "<changeName>"
```
The scorecard counts avoided workers. It never estimates tokens saved.
Write `none` to
`<reviewDir>/test-writer-handoff.md`, `<reviewDir>/implementer-handoff.md`,
and `<reviewDir>/skips.md`. Continue at the green gates. When the verdict
is `not-mechanical`, apply is `select-model`, or there is no unit, keep
tests-first. Do not ask the implementer whether the work is menial.
Do not dispatch a catalogue fast model. A payload flag is not proof that a
script ran.

## Before an implementer dispatch

Write `<reviewDir>/mechanical-edit.json` and apply it:
```
bun "${FACTORY_ROOT}/scripts/apply-mechanical-edit.ts" "<reviewDir>/mechanical-edit.json" "<repoRoot>"
```
Incomplete or free-text findings are not a unit. Persist the JSON plan.
The units it proves are listed in `$FACTORY_ROOT/reference/mechanical-edit.md`.
When `apply` is `script`, the helper
already wrote the files. Do not dispatch the `implementer`. Write
`<reviewDir>/skipped-workers.json` naming `implementer` and persist with
`record-skip.ts`, then refresh `routing-scorecard.ts`, even when
`routingProfiling` is `off`. The scorecard counts avoided workers. It never
estimates tokens saved. Write `none`
to `<reviewDir>/implementer-handoff.md` if it is empty, and continue at
the green gates (step 8). When the verdict is `not-mechanical`, apply is
`select-model`, or there is no unit, keep the model from step 6. Do not
ask the implementer whether the work is menial. Do not dispatch a catalogue
fast model. A payload flag is not proof that a script ran.
