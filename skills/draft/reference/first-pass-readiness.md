# First-pass readiness review

Read this at step 7c when the feasibility `complexitySignal` is `medium` or `high`, after explain-back proceeds.

Resolve `frontier` and dispatch **one** `first-pass-reviewer` subagent with that
exact available model (tools `Read, Grep, Glob` only). The reviewer sees only
the change directory `openspec/changes/<changeName>/`, including `tasks.md`,
and the checked paths. Leave out `.delivery.json`, the change metadata that
carries the work-item key. The reviewer never receives the work item,
`decisions.md`, the grilling history, or anything under `.review/draft-`.

List the checked paths in the dispatch prompt and nothing else. A path is
checked only when it is written in backticks, is repository-relative, contains
at least one slash, ends in `.ts`, `.md`, `.json`, `.yml`, `.yaml`, `.py`,
`.java`, `.sh`, `.toml`, or `.xml`, and contains no angle bracket. A path with
an angle bracket placeholder is never listed. Do not list a path that starts
with `.review/`, `.delivery/`, `/`, or `<`, a runtime scratch file, meaning any
path whose last segment is `skipped-workers.json`, or a bare filename with no
directory. Name the repository root in the dispatch so the reviewer reads each
path from it.

Persist its single JSON verdict to `<reviewDir>/readiness-<attempt>.json` and
route it with the step 7c `draft-route.ts readiness` command.

`attempt` starts at 1. Exit 1 means a missing or malformed verdict: **stop**
and escalate with one provider note naming the validator failure. Do not retry
the dispatch with a fresh agent and never treat the verdict as a pass. A not
ready verdict never continues to step 8. Act on `action`:

- `proceed`: continue to step 8.
- `revise`: report each item, then revise the change files to fix every
  reported item. Regenerate the task list from the revised specs with
  `generate-tasks.ts`, and never write the task list by hand. Run step 7c once
  more as attempt 2 with the same isolated inputs.
- `escalate` (exit 3): the revised change is still not ready. Post one note
  naming each reported item through the provider, then **stop** with the stop
  id `unready-change`. A person decides and re-invokes `/draft`. Do not verify,
  commit, or post the spec-ready note.
