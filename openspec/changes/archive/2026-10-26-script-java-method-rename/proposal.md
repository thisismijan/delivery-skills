## Why

Java type renames can apply without a model. A single method rename still
pays the standard worker even when every identifier token lives in the
listed files.

## What Changes

- Apply a Java method rename when the listed files contain exactly one
  method declaration of the source name, no type declaration of that name,
  every remaining identifier token lives in those files, and the target
  name is unused.
- Calls of the form `obj.method(` are not counted as declarations.
- Do not dispatch or promote a fast catalogue model.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `mechanical-edit-classification`: a proven Java method rename is applied
  by script.

## Impact

- `factory/scripts/apply-java-mechanical-edit.ts`.
