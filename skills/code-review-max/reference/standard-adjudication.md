# Standard adjudication mode

Read this when `review-fanout.ts adjudication` returns the mode `standard`, which means every candidate is Low.

Dispatch one fresh read-only subagent on the resolved `standard` model to apply
the skill's `## Adjudicate every candidate` section, including step 0,
`reference/review-memory.md`, and the Severity rules. It may raise a severity,
and it still blocks when several Low findings share one root cause that makes
the change unsafe. Its reply ends with one fenced JSON object
`{ "findings": "<markdown>", "outcome": { ... } }`: `findings` is the numbered
findings in the output format, empty when there are none, and `outcome` is the
object `record` reads, as `reference/review-memory.md` describes. The main
conversation writes `outcome` unchanged to `memory-outcome.json` and runs
`record`; the subagent does neither. A reply with no such object, or whose
`outcome` `record` refuses, is not recorded from prose: the main conversation
adjudicates that review itself in `main` mode instead.
