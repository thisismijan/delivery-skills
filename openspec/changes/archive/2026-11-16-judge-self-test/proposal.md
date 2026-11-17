## Why

Skill improvement and fast-model graduation both trust a `utility` score. When
that score comes from a model judging the output, nothing showed the judge could
tell good output from bad on the task, so a judge that scores at random, or the
wrong way round, could promote a model or approve a skill change.

## What Changes

- A new `judge-self-test.ts` defines how a utility score was produced: by checks,
  or by a judge together with its self-test (its scores for a known-good and a
  known-bad reference on the same task).
- Improve's paired evaluation accepts that record on each run, requires both
  runs to be scored the same way, and fails the evaluation with the reason when a
  judge tied or ranked the known-bad reference higher.
  `generate-paired-evidence.ts` carries the record through from each gate-result
  file.
- Model graduation refuses such a score when it is recorded, and the promotion
  report never counts one already stored.
- `improve.md` tells the evaluator to record how utility was scored.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `fast-model-graduation`: a judge's scores count only after it passes a
  known-good versus known-bad self-test.

## Impact

- New `factory/scripts/judge-self-test.ts`; `paired-evaluation.ts`,
  `generate-paired-evidence.ts`, `evaluation-corpus.ts`
- `skills/delivery/workflows/improve.md`
