## Why

Python and TypeScript identifier renames can already apply without a model.
Java type renames still pay the standard worker even when the listed files
hold the only class, interface, enum, or record of that name.

## What Changes

- Apply a Java type rename when exactly one type declaration of the source
  name is in the listed files, every remaining identifier token lives in
  those files, and the target name is unused.
- Leave files unchanged for method names, incomplete graphs, comments, and
  string literals.
- Do not dispatch or promote a fast catalogue model.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `mechanical-edit-classification`: a proven Java type rename is applied by
  script.

## Impact

- `factory/scripts/apply-java-mechanical-edit.ts` and the apply dispatcher.
- README and runtime docs name Java alongside TypeScript and Python.
