## Why

TypeScript import-only already adds a unique missing import. Python and
Java still only drop unused imports, so a single unused name that is
defined once in the repository still starts a worker.

## What Changes

- Python import-only adds `from module import Name` when exactly one
  repository file exports that top-level name.
- Java import-only adds `import package.Name;` when exactly one public
  type matches.
- Two candidates, builtins, `java.lang` types, star imports, and a
  definition outside a proven module path keep the add skipped. Unused
  import removal still runs.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `cost-efficient-routing`: unique Python and Java missing imports are
  scripted.

## Impact

- `factory/scripts/python-mechanical-edit.py`
- `factory/scripts/apply-java-mechanical-edit.ts`
- operator docs that name import-only
