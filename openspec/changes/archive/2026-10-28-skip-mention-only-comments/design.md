## Context

Reviewers sometimes ping a teammate with a lone mention. That is not a
finding to classify.

## Goals / Non-Goals

**Goals:**

- A body that is only `@name` skips the assessor as outdated.

**Non-Goals:**

- Parsing notification metadata or resolving who was pinged.

## Decisions

- **Whole body must be one mention.** Extra prose stays in scope.

## Risks / Trade-offs

- [A reviewer meant the mention as the whole review] → mixed text still
  uses the assessor.
