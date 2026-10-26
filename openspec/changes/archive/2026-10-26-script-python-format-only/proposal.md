## Why

Python unused imports can apply without a model. Format-only units still pay
the standard worker even when spacing can change without renaming names or
literals.

## What Changes

- Apply CPython tokenize/untokenize on listed Python files when identifier,
  number, string, operator, and comment tokens stay identical.
- Leave files unchanged when the rewrite would change that token stream or
  the parse tree.
- Do not dispatch or promote a fast catalogue model.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `mechanical-edit-classification`: a proven Python format-only rewrite is
  applied by script.

## Impact

- `factory/scripts/python-mechanical-edit.py` and `apply-mechanical-edit.ts`.
