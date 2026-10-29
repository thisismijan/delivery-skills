## Why

C# is the highest-ranked TIOBE language not covered after Go. The factory can
prove a conservative identifier rename and one unique repository type import
without embedding Roslyn, while a repository-owned formatter wrapper can keep
format-only deterministic.

## What Changes

- Recognize `.cs` as a mechanical-edit language.
- Rename one declaration only when every identifier token with that name is in
  the listed files. Overloads, shadowing, target collisions, unlisted
  references, malformed source, and an interpolated string containing the name
  stay on the model worker.
- Import-only adds a `using` only when a used capitalized type name is declared
  in exactly one namespace in the repository. It does not guess whether an
  existing namespace import is unused without semantic compiler evidence.
- Format-only invokes executable `bin/csharpier` with source on stdin and the
  source file after `--stdin`. The rewrite is accepted only when the complete
  non-whitespace token stream, including names and literals, is identical.
- No Roslyn or .NET runtime dependency is added to the Bun factory.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `cost-efficient-routing`: proven C# mechanical edits skip model workers.

## Impact

- New `factory/scripts/apply-csharp-mechanical-edit.ts` and tests
- `factory/scripts/apply-mechanical-edit.ts`
- Mechanical-edit documentation and contract tests
