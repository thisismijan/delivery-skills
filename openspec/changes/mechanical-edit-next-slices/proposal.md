## Why

Scripted mechanical edits still send a worker for unique Python locals,
unique Java fields, a Java type whose file name matches, a unique missing
TypeScript import, and format-only work when the repo already has Prettier,
Ruff, or google-java-format. Those cases already meet the local, reversible,
strongly verified bar.

## What Changes

- A unique Python parameter or local rename applies without a worker when
  one binding is in the listed files and attributes, exec, and eval are
  absent.
- A unique Java field rename applies without a worker. `serialVersionUID`
  and overloads still keep the worker.
- A unique Java type rename also renames `From.java` to `To.java` when the
  listed file name matches.
- TypeScript import-only adds a missing import when the language service
  offers exactly one fix in listed files.
- Format-only uses the repo Prettier, Ruff, or google-java-format binary
  when it is inside the repository, then keeps the token-identity gate.
  Absent that binary, today's formatter still runs.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `cost-efficient-routing`: the five proven mechanical-edit slices.

## Impact

- `factory/scripts/apply-mechanical-edit.ts`
- `factory/scripts/apply-java-mechanical-edit.ts`
- `factory/scripts/python-mechanical-edit.py`
- `skills/execute/SKILL.md`
- `skills/address-comments/SKILL.md`
- operator docs that name the rewrite helper
