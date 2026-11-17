## Why

The improve workflow decided a skill change on one baseline run and one
candidate run. One run per arm cannot separate a real gain from run-to-run
variance, so a lucky or unlucky run could decide whether a candidate passed
the 90 percent utility bar.

## What Changes

- Paired evidence gains a version 2 form holding 3 runs per arm, or 5 after a
  close call. The arms alternate which goes first. Every run keeps the same
  controls and the same managed tree for its arm.
- The evaluator applies every existing gate to every run. It judges utility on
  the ratio of the arms' median utilities, and requires most runs to clear the
  bar. It reports a sign-test probability as a diagnostic.
- A close call at 3 runs per arm exits 3 and asks for 2 more per arm. That
  means a median ratio within 0.05 of the bar, or a median that disagrees with
  the run count. Five runs per arm always decide.
- The evaluation command refuses one run per arm. The generator accepts a
  version 2 plan with a `pairs` list.
- Model graduation's corpus runners still evaluate single pairs per case
  through the library. That is out of scope here.

Out of scope: changing the 90 percent bar, the judge self-test, and
evaluations with no paired arms.

## Capabilities

### New Capabilities

- `paired-skill-evaluation`: a skill change is judged on repeated, alternating
  runs per arm with a bounded extension for close calls.

### Modified Capabilities

None.

## Impact

`factory/scripts/paired-evaluation.ts`, `factory/scripts/generate-paired-evidence.ts`,
their tests, and the paired benchmark section of
`skills/delivery/workflows/improve.md`.
