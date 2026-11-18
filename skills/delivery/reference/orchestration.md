# Orchestration policy

Read this before you dispatch a subagent or an isolated worker, before you
register or promote a fast model, and whenever `routingProfiling` is `always`.

Keep the lifecycle portable across conforming runtimes.

- Before the final groomed plan is approved, a mutating stage or a stage with
  an operator checkpoint runs in the main conversation. After continuous
  authorization is recorded, independent tickets may run as mutating isolated
  workers in separate worktrees. A worker stops at merge, risk acceptance, a
  failed or ambiguous gate, or candidate installation; it never tries to take
  that decision itself.
- Use one to four read-only subagents for bounded research, review, or
  evaluation. Give peers the same immutable brief and require structured
  results so failures cannot disappear in prose.
- A runtime-specific workflow helper may replace a large homogeneous read-only
  fan-out when the runtime advertises it. A delivery outcome must not depend on a helper that only one host provides.
- Store intermediate state in the ledger or a named artifact, not only in an
  agent result, script variable, or conversation context.
- Treat a missing, null, stalled, malformed, or unverified worker result as
  incomplete. Fail closed or report it as unverified; never count it as
  agreement.
- Start with a small slice. Expand fan-out only after its output contract and
  verification phase have succeeded. Do not spend dozens of agents on a task a
  bounded pass can answer.
- Reusable orchestration is promoted only after a real run succeeds. Generated
  orchestration never bypasses permission, correctness, security, failure, or
  rollback rules. Continuous authorization replaces repeated progression
  confirmations; it does not replace evidence gates.
- **Shadow model routing.** Diagnostic profiling is opt-in. Read
  `routingProfiling` from `bun "${FACTORY_ROOT}/scripts/config.ts"`; it defaults
  to `off` and is enabled only when `ROUTING_PROFILING=always`. In that mode, a
  frontier-level read-only `task-profile-controller` classifies each task.
  Factory stages persist that profile, gate outcomes,
  repairs, escalations, context size, wall time, and token, cost, or character
  counts under
  `.delivery/routing/`. `capture-usage.ts` records those figures; do not guess
  them. `select-model.ts` determines the required capability;
  `model-catalogue.ts` chooses an exact model from the runtime-advertised list.
  A runtime-advertised live frontier candidate can satisfy frontier work. A
  cheaper shadow recommendation is recorded, never dispatched. After each run,
  generate the routing comparison report and rebuild the evaluation corpus from
  those files. Fast catalogue models stay evaluation-only until
  representative-run scores for the exact candidate clear the 90 percent bar
  and `fast-dispatch.ts promote` is run with `--approve` of that same id.
  Named safety floors block auth,
  migration, concurrency, distributed-state, weak-verification, and holdout
  work. Live availability stays unchanged without an exact operator promotion approval.
  Public rankings never promote.
  Test-repo stand-in scores never promote.
  Changing the catalogue does not change this run. With profiling off, skip
  the controller call and routing telemetry only. Live model selection,
  implementation, and holdout review remain unchanged, and every quality gate
  still runs.
