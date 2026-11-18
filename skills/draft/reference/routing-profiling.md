# Routing profiling for draft

Read this at step 7 when `routingProfiling` is exactly `always`. It records diagnostics only: it never changes authoring dispatch or weakens a quality gate.

Resolve `frontier` against the runtime inventory and dispatch the
`task-profile-controller` with that exact available model (tools
`Read, Grep, Glob` only) and a compact evidence bundle for the OpenSpec
authoring task. Persist its JSON to `<reviewDir>/author-profile.json` and
validate it:

```
bun "${FACTORY_ROOT}/scripts/task-profile.ts" "<reviewDir>/author-profile.json"
bun "${FACTORY_ROOT}/scripts/shadow-route.ts" "<reviewDir>/author-profile.json" sonnet "<reviewDir>/author-shadow.json"
```

In `always` mode, record the decision; **do not change the model used to author**. Live dispatch stays Sonnet unless an existing factory rule already says otherwise. The shadow file is evidence only. Start a usage timer before authoring, then capture usage after `verify-change.ts` returns. Do not invent token or cost figures:

```
bun "${FACTORY_ROOT}/scripts/capture-usage.ts" start "<reviewDir>/author-usage-timer.json"
```

After the outcome file exists, finish capture. Pass `--host "<reviewDir>/host-usage.json"` only when the runtime wrote that file with host-advertised tokens or cost. Always pass the named artifacts:

```
bun "${FACTORY_ROOT}/scripts/capture-usage.ts" finish "<reviewDir>/author-usage-timer.json" "<reviewDir>/author-usage.json" --input "<reviewDir>/author-profile.json" --output "<reviewDir>/author-outcome.json"
```

Then persist the observation under the target repo's `.delivery/routing/`:

```
bun "${FACTORY_ROOT}/scripts/record-routing.ts" persist "<repo>/.delivery/routing" "<changeName>" "<reviewDir>/author-profile.json" sonnet "<reviewDir>/author-outcome.json" "<reviewDir>/author-usage.json" <controller-model>
bun "${FACTORY_ROOT}/scripts/routing-scorecard.ts" "<repo>/.delivery/routing" "<changeName>"
```

Refresh the run scorecard after every persisted task. It reports measured live
usage and outcomes, but labels shadow quality and savings unevaluated until a
paired benchmark exists. `author-outcome.json` records whether verification
passed, any repairs, and any escalation. Do not omit it; persistence refuses a
missing outcome. The usage file comes from `capture-usage.ts`. It always
records wall time, uses host tokens and cost when present, and otherwise
records character counts of those artifacts. Never write `{ "source": "unavailable" }` by hand.
