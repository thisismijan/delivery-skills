## Why

Kotlin is below the TIOBE top 20 but is the closest ecosystem sibling to Java,
which the factory already supports. A dedicated Kotlin tokenizer is required;
reusing Java's would silently misunderstand `fun`, `val`, string templates,
and Kotlin imports.

## What Changes

- Recognize `.kt` and `.kts` as mechanical-edit languages.
- Rename one declaration only when every identifier token with that name is in
  listed files. Overloads, shadowing, target collisions, unlisted references,
  malformed source, backtick identifiers, and string templates containing the
  name stay on the model worker.
- Import-only adds an import only when a used capitalized type is declared at
  exactly one package-qualified path in the repository. Ambiguity is skipped.
- Format-only requires executable repository wrapper `bin/ktfmt`, using source
  on stdin and `--stdin <relative-file>`. Output is accepted only when its
  complete non-whitespace token stream is identical.
- Kotlin files are not renamed with their types because Kotlin has no Java-like
  file-name requirement.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `cost-efficient-routing`: proven Kotlin mechanical edits skip model workers.

## Impact

- New `factory/scripts/apply-kotlin-mechanical-edit.ts` and tests
- `factory/scripts/apply-mechanical-edit.ts`
- Mechanical-edit documentation and contract tests
