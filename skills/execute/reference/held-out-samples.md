# Held-out samples

This applies at step 8, once the green gate passes, when `design.md` records held-out samples.

Run them once. Dispatch the `test-writer` with only the samples under
`.review/<changeName>/held-out-samples/` and their labels, to add one test file
that runs the rule over them and changes no other test. A case the rule gets
wrong is kept in that file as a recorded miss with its label, so the suite
stays green and the miss stays visible. Re-run the green gate and persist it as
`held-out-gate-<source-commit>.json` with the other evidence for the holdout
review. Never send a miss to the implementer: a rule fixed against held-out
samples has made them samples it was written from. Name every miss under
"What the checks do not prove" instead.
