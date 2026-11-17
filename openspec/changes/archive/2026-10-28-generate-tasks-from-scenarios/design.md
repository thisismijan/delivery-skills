## Context

OpenSpec delta specs already name every scenario. The draft author copies
them into `tasks.md` by hand, which costs a model turn and can drift from
the spec.

## Goals / Non-Goals

**Goals:**

- Generate a tests-first `tasks.md` from `#### Scenario` headings.
- Fail when the specs contain no scenarios.

**Non-Goals:**

- Generating proposal, design, or spec prose.
- Grouping work differently from one-test-per-scenario.

## Decisions

- **Overwrite `tasks.md`.** Re-draft replaces the file in place, same as
  the other artifacts.
- **One implementation task.** The scenarios already enumerate the
  behaviour; extra implementation slices would invent grouping.
- **Sanitize titles.** Scenario names are human-facing checklist text.

## Risks / Trade-offs

- A spec that buries work in design.md without a scenario will not get a
  task. That is fail closed: add a scenario.
