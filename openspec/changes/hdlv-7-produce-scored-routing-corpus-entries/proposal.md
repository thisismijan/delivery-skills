## Why

Delivery already records routing observations, comparison reports and an evaluation corpus, but corpus entries never receive a score, and a missing outcome can be stored as a successful result. Fast-model promotion therefore has no representative producer, and synthetic fixtures can be mistaken for live evidence. Operators need model recommendations based on measured, representative delivery work.

## What Changes

- Add a pure scoring function that turns a routing observation and a candidate result into an evaluation recording relative utility and critical misses for that exact candidate model and task class (the observation's work type).
- Add a pure promotion report builder that groups scored corpus entries by exact candidate, task class and evidence source, so live and representative-run (synthetic) evidence are reported separately and never pooled.
- Make routing persistence require an explicit, validated outcome. A missing outcome is refused instead of defaulting to a successful result, including in the `record-routing` command line.
- Record the task class on the stored evaluation, as an additive optional field so existing corpus files still read.

Out of scope: enabling a fast model for live work, and changing the 90 percent quality bar.

## Capabilities

### New Capabilities

- `routing-corpus-scoring`: scored corpus entries per exact candidate and task class, a promotion report that separates live from representative evidence, and a persistence rule that never defaults an outcome to success.

### Modified Capabilities

None.

## Impact

- `factory/scripts/evaluation-corpus.ts`: scoring function, promotion report builder, additive task class on the evaluation.
- `factory/scripts/record-routing.ts`: outcome becomes required and validated at the persistence boundary and in the command line.
- `factory/scripts/routing-observation.ts`: no schema loosening; callers that omitted an outcome must now supply one.
- `factory/scripts/representative-routing-runs.ts`, the draft, execute and address-comments skills, and `factory/RUNTIME.md`: audited and updated for the required outcome.
- Existing corpus files without a task class remain readable.
