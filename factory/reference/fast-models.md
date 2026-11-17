# Fast catalogue models

How a catalogue fast model becomes a live worker. `/execute` dispatches one
only when it is already live.

Do not dispatch a catalogue fast model unless it is live and
`fast-dispatch.ts` later reports that the exact candidate on
representative-run reversible, strongly verified work has cleared the 90 percent
bar. Register a new exact id with `model-catalogue.ts register-fast`.
Mark it live only with `fast-dispatch.ts promote` and `--approve` of that
same id. Named safety floors still block auth, migration,
concurrency, distributed-state, weak-verification, and holdout tasks. Do
not treat a cleared bar, a public ranking, an unscored fixture, or a
test-repo stand-in as live availability. That change needs an exact
operator promotion approval naming the candidate.
