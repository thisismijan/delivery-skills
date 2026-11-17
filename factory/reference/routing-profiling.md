# Routing profiling

`/execute` reads this only when `routingProfiling` is exactly `always`. It
adds diagnostic evidence and never changes the live model, the worker, or a
gate.

## Implementation

**Optionally profile and shadow-route implementation.** Read
`routingProfiling` from
`bun "${FACTORY_ROOT}/scripts/config.ts"` (default `off`). Only when it is
exactly `always`, resolve `frontier`, then dispatch the
`task-profile-controller` subagent with that exact available model (tools:
`Read, Grep, Glob` only) and a compact bundle of the spec, feasibility meta,
and blast radius. Persist its JSON to
`<reviewDir>/implement-profile.json` and validate it:
```
bun "${FACTORY_ROOT}/scripts/task-profile.ts" "<reviewDir>/implement-profile.json"
bun "${FACTORY_ROOT}/scripts/shadow-route.ts" "<reviewDir>/implement-profile.json" <live-model> "<reviewDir>/implement-shadow.json"
```
In `always` mode, persist that JSON. **Dispatch still uses the live `select-model.ts`
capability and the exact model returned by `model-catalogue.ts`.** A cheaper
`shadowTier` is a recommendation for later evaluation, never this run's
worker. Start a usage timer before the implementer runs:
```
bun "${FACTORY_ROOT}/scripts/capture-usage.ts" start "<reviewDir>/implement-usage-timer.json"
```
After the red and green gates (or an escalation), write the outcome file,
then finish capture. Pass `--host "<reviewDir>/host-usage.json"` only when
the runtime wrote that file. Always pass the named artifacts:
```
bun "${FACTORY_ROOT}/scripts/capture-usage.ts" finish "<reviewDir>/implement-usage-timer.json" "<reviewDir>/implement-usage.json" --input "<reviewDir>/implement-profile.json" --output "<reviewDir>/implement-outcome.json"
```
Then persist the observation:
```
bun "${FACTORY_ROOT}/scripts/record-routing.ts" persist "<repo>/.delivery/routing" "<changeName>" "<reviewDir>/implement-profile.json" <live-model> "<reviewDir>/implement-outcome.json" "<reviewDir>/implement-usage.json" <controller-model> <implementation-model>
bun "${FACTORY_ROOT}/scripts/routing-scorecard.ts" "<repo>/.delivery/routing" "<changeName>"
```
The outcome file records each gate result, repair count, and escalations.
Do not omit it; persistence refuses a missing outcome. The usage file comes
from `capture-usage.ts`. It always records wall time, uses host tokens and
cost when present, and otherwise records character counts of those
artifacts. Never write `{ "source": "unavailable" }` by hand.
Persist both exact resolved model identifiers.    When `routingProfiling` is
`off`, skip this entire profiling, usage-capture, routing-persistence, and
scorecard block and dispatch the same implementation worker directly. Still
persist scripted skips with `record-skip.ts` and refresh the scorecard after
those skips. This
setting only removes diagnostic work; it never changes the live model or
weakens a quality gate.

## Holdout review

When `routingProfiling` is exactly `always`, dispatch `task-profile-controller` with that frontier model, validate with `task-profile.ts`, then persist `bun "${FACTORY_ROOT}/scripts/shadow-route.ts" "<reviewDir>/review-profile.json" opus "<reviewDir>/review-shadow.json"`. In that mode, start a usage timer before the holdout reviewer:
```
bun "${FACTORY_ROOT}/scripts/capture-usage.ts" start "<reviewDir>/review-usage-timer.json"
```
After the verdict, write the outcome file, finish capture, then persist the observation with the controller's exact model identifier. Pass `--host "<reviewDir>/host-usage.json"` only when the runtime wrote that file:
```
bun "${FACTORY_ROOT}/scripts/capture-usage.ts" finish "<reviewDir>/review-usage-timer.json" "<reviewDir>/review-usage.json" --input "<reviewDir>/review-profile.json" --output "<reviewDir>/review-outcome.json"
bun "${FACTORY_ROOT}/scripts/record-routing.ts" persist "<repo>/.delivery/routing" "<changeName>" "<reviewDir>/review-profile.json" opus "<reviewDir>/review-outcome.json" "<reviewDir>/review-usage.json" <frontier-model> <frontier-model>
bun "${FACTORY_ROOT}/scripts/routing-scorecard.ts" "<repo>/.delivery/routing" "<changeName>"
```
In `always` mode, refresh the run scorecard after each persisted task. It reports measured
live usage and outcomes, but labels shadow quality and savings unevaluated
until a paired benchmark exists. `review-outcome.json` records the holdout
verdict's terminal result, repairs, and escalations. Do not omit it;
persistence refuses a missing outcome. Never write
`{ "source": "unavailable" }` by hand. When `routingProfiling` is `off`,
skip the profile, usage-capture, routing-persistence, and scorecard commands.
