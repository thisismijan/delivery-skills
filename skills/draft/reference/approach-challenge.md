# Approach challenge

Read this at step 7a when the feasibility `complexitySignal` is `medium` or `high`.

Resolve `frontier` and dispatch **one** `approach-challenger` subagent with that
exact available model (tools `Read, Grep, Glob` only), the work item, the
feasibility approach sketch, and `openspec/changes/<changeName>/` (proposal,
design, specs). Persist its single JSON verdict to
`<reviewDir>/approach-challenge-<attempt>.json` and route it with the step 7a
`draft-route.ts approach` command.

`attempt` starts at 1. A non-zero exit other than 3 means a malformed verdict:
**stop and escalate**. Act on `action`:

- `proceed`: continue to step 7b.
- `add-scenarios`: add each listed gap to the spec as a scenario under the
  requirement it belongs to, so the test writer covers it, or name it in the
  proposal as out of scope with the reason. Then regenerate `tasks.md` with
  `generate-tasks.ts` and continue to step 7b. Do not challenge again.
- `revise`: rewrite `design.md` and the affected specs to an approach that
  removes the named problem, then run step 7a once more with `attempt` 2.
- `escalate` (exit 3): the revised approach still cannot cover its cases. Post
  the reason and gaps as a provider note, following the conductor's Human
  decision brief for the options, and **stop**. A person chooses the approach
  and re-invokes `/draft`.
