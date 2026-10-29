## Why

Go is the highest-value language not yet covered by the factory's proven
mechanical-edit path. Its standard parser and formatter can prove a useful,
fail-closed subset without adding an npm dependency or sending a bounded edit
to a model.

## What Changes

- Recognize `.go` as a mechanical-edit language.
- Add a bundled Go standard-library helper, invoked with the target repository
  and the existing JSON unit.
- Rename one unexported identifier only when it has one declaration and every
  occurrence in its package is in the listed files. Exported identifiers,
  shadowing, an existing target, and incomplete package files stay on the
  model worker.
- Import-only removes unused ordinary imports and adds a local package import
  only when the selector's package name resolves to exactly one directory in
  the repository's module. Blank and dot imports are retained; ambiguous
  missing imports are skipped.
- Format-only uses Go's standard formatter. Strings, comments, and tokens are
  preserved by the parser and formatter.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `cost-efficient-routing`: proven Go mechanical edits skip the model workers.

## Impact

- `factory/scripts/go-mechanical-edit.go`
- `factory/scripts/apply-mechanical-edit.ts` and tests
- Mechanical-edit documentation and workflow contract tests
