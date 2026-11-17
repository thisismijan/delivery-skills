## Why

Mechanical-edit apply currently proves TypeScript identifier renames only.
Python is a primary language for this factory and still pays the standard
model for a local, reversible rename.

## What Changes

- Detect the language of a classified mechanical-edit from the listed files.
- Apply a Python identifier rename through CPython's tokenizer and AST when
  there is exactly one function or class definition, every remaining name
  token lives in the listed files, and the target name is unused.
- Leave files unchanged when the graph is incomplete, the name is ambiguous,
  or Python is missing.
- Do not dispatch or promote a fast catalogue model.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `mechanical-edit-classification`: a proven Python identifier rename is
  applied by script.

## Impact

- `factory/scripts/python-mechanical-edit.py` and `apply-mechanical-edit.ts`.
- README and runtime docs name Python alongside TypeScript.
