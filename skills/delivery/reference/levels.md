# Levels

Read this when the arguments name a level word, when the run contract's level
is not `standard`, or when the operator asks about levels.

A level trades cost against speed and depth for one run. It changes how much
the factory spends, never what must be true before a change lands.

| Level | Workers at once | Fix attempts | Review rounds | Review lenses | Implementer |
|-------|-----------------|--------------|---------------|---------------|-------------|
| `min` | 2 | 1 | 2 | Size alone never adds lenses | Standard tier; frontier when the change is justified as complex |
| `standard` | 4 | 2 | 3 | Measured from the diff | Standard tier; frontier when the change is justified as complex |
| `max` | 8 | 3 | 4 | Every lens on every change | Frontier |

`bun "${FACTORY_ROOT}/scripts/levels.ts" [level]` prints these values.
`config.ts`, `review-fanout.ts`, and `select-model.ts` read `DELIVERY_LEVEL`.
An explicit `MAX_PARALLEL_WORKTREES`, `MAX_FIX_ATTEMPTS`, or
`MAX_REVIEW_ROUNDS` still wins for that one knob; `config.ts` lists it under
`overrides`. Record the level and the effective values `config.ts` prints in
the ledger's Decisions.

No level changes any of these:

- holdout review, the `/code-review-max` and `/mr-review` chain, and the
  frontier model for review;
- every review lens on a change that touches a sensitive surface, changes a
  dependency, is one-way, or was not fully classified;
- release-readiness lenses, the readiness GO and its rollback plan, and the
  land gate;
- the rule that fast models stay evaluation-only;
- any human-owned decision.

A single-step run without a run contract uses the level for that step only.
