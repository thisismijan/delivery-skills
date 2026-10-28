## Context

`apply-mechanical-edit.ts` already applies unique TypeScript symbols, unique
Python functions and classes, unique Java types and methods, unused imports,
and format-only whitespace. Extract method stays on the implementer. This
change only widens identifier kinds and the format engine.

## Goals / Non-Goals

**Goals:**

- Prove one Python parameter or local binding and rewrite that function only.
- Prove one Java field and rewrite its identifier tokens.
- Move `From.java` to `To.java` when a unique type rename matches the file
  name.
- Add a TypeScript import when `getCodeFixesAtPosition` returns exactly one
  missing-import fix in listed files.
- Prefer a repo-local Prettier, Ruff, or google-java-format binary for
  format-only, then refuse the result when names or literals change.

**Non-Goals:**

- Extract method, extract constant, move-to-file, inline, or deleting unused
  members.
- Python or Java missing-import insertion.
- Global Prettier or Ruff on PATH when the repository does not vendor them.

## Decisions

1. Python locals use AST bindings, not a whole-file token replace. A second
   binding, an `Attribute` of the same name, `exec`, or `eval` is
   `select-model`. Function and class renames keep today's token rewrite.
2. Java fields are `type name;` or `type name =`, never `name(` or a
   parameter followed by `,` or `)`.
3. File rename is only for a unique type whose listed basename is `from.java`.
   The destination must not already exist.
4. Missing imports run after unused-import organization. Several codefixes
   for one diagnostic skip the add and still allow unused-import removal.
5. Formatter lookup is repo-local: `node_modules/.bin/prettier`,
   `.venv/bin/ruff` or `venv/bin/ruff`, and `bin/google-java-format`. Missing
   binary keeps the built-in formatter.

## Risks / Trade-offs

- A unique Python local in a file that also mentions the name as an
  attribute would be a wrong rewrite; the attribute check refuses it.
- A repo formatter that changes quotes fails the identity gate and keeps
  the worker, so the ticket does not silently restyle APIs.
