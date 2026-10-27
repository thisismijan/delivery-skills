## Why

Unscripted mechanical-edit fixtures can be listed, but the five-score
paired loop still needs isolated git test repos. A local rewrite that
looks like a perfect Haiku score must not count as graduation evidence.

## What Changes

- Materialize each unscripted fixture as a temporary git test repository.
- Run a paired baseline/candidate loop and write corpus files to a
  caller-supplied directory.
- Record local stand-in rewrites with provenance `test-repo-stand-in`.
- Exclude that provenance from graduation and fast dispatch samples.
- Leave live catalogue availability unchanged, including Haiku.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `fast-model-graduation`: test-repo stand-in scores are not graduation
  evidence; unscripted fixtures can run as isolated git test repos.

## Impact

- `factory/scripts/evaluation-corpus.ts`
- `factory/scripts/fast-dispatch.ts`
- `factory/scripts/mechanical-edit-test-repos.ts`
- README and factory runtime notes
