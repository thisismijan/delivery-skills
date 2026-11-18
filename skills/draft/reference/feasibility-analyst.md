# Dispatching the feasibility analyst

Read this at step 4 when `skipAnalyst` is false.

First look for the grooming explorer report behind this work item:

```
bun "${FACTORY_ROOT}/scripts/explorer-context.ts" find "<repoRoot>" "<reviewDir>/work-item.json" \
  > "<reviewDir>/explorer-context.json"
```

Non-zero exit → **stop and escalate**. It finds the one grooming folder whose
draft has this work item's exact title, and says whether the report is stale
and which files changed since its recorded head. Then resolve `standard` and
dispatch the `feasibility-analyst` subagent with that exact available model
against the codebase for this ticket, giving it `explorer-context.json` and,
when it names one, the report as its starting map. Never give the report to the explain-back reader or the readiness reviewer. Persist its single JSON
`FeasibilityVerdict` to `<reviewDir>/feasibility.json`.
