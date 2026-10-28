## Context

`unscriptedMechanicalFixtures` is the representative sample for fast-tier
scoring. After unique locals, fields, file moves, missing imports, and
repo formatters, several old units are scripted and several new
refusals are not in the pack.

## Goals / Non-Goals

**Goals:**

- Pack only units whose apply result is `select-model`.
- Cover attribute, exec, serialVersionUID, and a name-changing
  formatter.

**Non-Goals:**

- Promoting Composer or any fast id.
- Running live model-run scores in this change.

## Decisions

- **Ambiguous missing imports stay out.** Those still apply as `script`
  after skipping the add.
- **Formatter fixture includes a repo binary.** Without one, the
  built-in formatter would script the unit.

## Risks / Trade-offs

- A later scripted slice can make a fixture apply as `script` and fail
  the pack test. That failure is the intended guard.
