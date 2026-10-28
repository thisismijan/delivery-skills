## Context

`applyUniqueMissingImports` uses the TypeScript language service. Python
and Java already parse imports well enough to drop unused names. They
do not yet add a missing one.

## Goals / Non-Goals

**Goals:**

- Add one import when a used name has exactly one proven export.
- Leave the file unchanged for that name when the export is ambiguous.

**Non-Goals:**

- Resolving third-party packages, star imports, or relative imports
  that need `__init__` layout guesses beyond a valid module path.
- Extract method or moving symbols.

## Decisions

- **Whole-repository export index, listed consumers.** Like TypeScript,
  the definition may live outside the listed files; the rewrite still
  lands only on listed files.
- **Top-level Python exports only.** Nested functions are not import
  candidates.
- **Public Java types only.** Package-private types stay unscripted.
- **Skip, do not fail, on ambiguity.** Unused-import cleanup can still
  apply as `script`.

## Risks / Trade-offs

- A valid module path that is not importable at runtime still gets an
  import. Holdout and green tests catch that, same as TypeScript.
