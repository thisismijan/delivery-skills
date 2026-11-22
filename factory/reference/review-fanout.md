# Review fan-out

Read this when a stage fans out review lenses: `/code-review-max` and release
readiness.

Independently adjudicated `/code-review-max` lenses use the resolved
`standard` model. Release-readiness lens subagents resolve that same
`standard` capability and pass the exact identifier; `review-fanout.ts readiness`
skips those subagents on an empty or proven small reversible measured diff.
The main conversation still decides GO or NO-GO. Fast-tier models do not run
those lenses.

Write measured counts and surfaces to
`.review/mr-<iid>/<full-head-sha>/review-fanout-input.json`, then run
`bun "$FACTORY_ROOT/scripts/review-fanout.ts" <that file>`. The returned
`lenses` array is authoritative. An empty `lenses` array means no reviewable
code; do not dispatch review-lens subagents. A small reversible change, or a
contained one (reversible, at most 6 files and under 400 lines, no sensitive
surface or dependency change), runs two essential lenses; larger, one-way,
sensitive, or unknown classification runs all four. Invalid input is a
terminal stop. Counts come from `review-fanout.ts measure <base> <head>`,
which leaves out OpenSpec and delivery artefacts.
`review-fanout.ts adjudication <candidates.json>` decides who verifies the
lens candidates: nobody when there are none, one standard-tier subagent when
all are Low, and the main conversation when any is Medium or above.
`review-fanout.ts --help` prints every input shape.

Surfaces, one-way signals, and lowered-bar hits start from
`bun "$FACTORY_ROOT/scripts/diff-scan.ts" <base> <head>`, used by
`/code-review-max` and release readiness. Its marks are a floor that the model
may add to and never remove. A non-zero exit stops the stage.
