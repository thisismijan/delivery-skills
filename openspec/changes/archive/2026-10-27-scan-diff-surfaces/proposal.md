## Why

Release readiness and the review fan-out both ask the main conversation to
read the whole diff and mark sensitive surfaces and lowered quality bars.
That is the most expensive context in the run, and most of the marking is
pattern matching on paths and changed lines. A missed mark is also unsafe: a
migration or a new `@ts-ignore` that the model overlooks turns off a lens or
a bar check.

## What Changes

- Add `factory/scripts/diff-scan.ts`, a deterministic scan of a pinned
  `base...head` diff for TypeScript, Python, and Java repositories. It
  reports surfaces with path and line evidence, one-way door signals, and
  lowered-bar hits: deleted or skipped tests, net-removed assertions, lowered
  thresholds, new suppressions, and not-implemented stubs in production code.
- Scripted marks are a floor. The model may add surfaces or hits it can
  prove; it may never remove a scripted one. An unreadable diff stops the
  stage.
- Release readiness steps 2 and 4 and the `/code-review-max` classification
  start from the scan instead of re-reading the diff to classify it.

## Capabilities

### New Capabilities

- `diff-surface-scan`: deterministic surface, door, and lowered-bar marks
  for a pinned diff.

### Modified Capabilities

- `release-readiness`: classification and the bar check start from the scan.

## Impact

- `factory/scripts/diff-scan.ts` and its tests
- `skills/delivery/workflows/release-readiness.md`
- `skills/code-review-max/SKILL.md`
- `factory/CONVENTIONS.md`, `factory/RUNTIME.md`, `docs/reference.md`
