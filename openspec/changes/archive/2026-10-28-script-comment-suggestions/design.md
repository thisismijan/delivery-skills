## Context

Forge suggestion fences carry the exact replacement text. A default
suggestion replaces the one anchored line.

## Goals / Non-Goals

**Goals:**

- Apply a whole-body, single-line suggestion on a new-side line without a
  model.

**Non-Goals:**

- Ranged suggestions (`suggestion:-1+2`), multi-line replacements, deleting
  a line, or a suggestion inside other review text.
- Skipping the classifier, the red test, the gates, or holdout.

## Decisions

- **Fail closed to the implementer.** Anything the helper cannot prove
  reports `model` and writes nothing.
- **Stay inside the repository.** An absolute path, a `..` segment, a
  symlink, or a non-regular file reports `model`.
- **Keep line endings.** CRLF files stay CRLF.

## Risks / Trade-offs

- [The suggested line does not compile or fails a test] → the green gate,
  lint, and typecheck run as before, and a failure goes to the implementer's
  bounded fix loop.
