# Fast-model evaluation and routing records

Read this when you evaluate, register, or promote a fast model, score a
mechanical edit, or record routing evidence. A delivery stage that only
dispatches workers does not need it.

Unpromoted `fast` candidates are `evaluation-only`. They may be resolved with
`--evaluation` for corpus benchmarking. Register a new exact id with
`model-catalogue.ts register-fast <id>`. Promote with
`fast-dispatch.ts promote <corpus> <id> --approve <id>`. Live delivery may
resolve `muse-spark-1.3-medium` and `haiku` without `--evaluation`. When the
inventory names an alias, resolve returns that advertised id so the host can
dispatch it. Composer stays evaluation-only. A later version id does not
inherit scores.

`fast-dispatch.ts` still gates the exact candidate and task class on
representative-run scores. Live scores are never mixed into that sample.
Fewer than five cases, a mean below the 90 percent bar, or any critical miss
keeps an unpromoted model evaluation-only. Named safety floors block auth,
migration, concurrency, distributed-state, weak-verification, and holdout work
even after the bar clears. Passing evidence does not change live availability
without an exact operator promotion approval naming that candidate.

A classified mechanical-edit may be scored for later graduation. The command
classifies it with `mechanical-edit.ts` and applies proven TypeScript,
JavaScript, Python, Java, Go, C#, and Kotlin rename, import-only, and
format-only units with `apply-mechanical-edit.ts`, including a unique Python
parameter or local, a unique Java field, a Java type whose listed file name
matches, a unique TypeScript, Python, Java, Go, C#, or Kotlin missing import,
and a repo Prettier, Ruff, or google-java-format binary, the Go standard
formatter, repo-local `bin/csharpier`, `bin/ktfmt`, `bin/rustfmt`,
`bin/php-format`, or `bin/swift-format` when names and literals stay
identical. Units the scripts cannot prove are listed in
`mechanical-edit-scoring.ts` for representative scoring only.
`mechanical-edit-test-repos.ts` materializes those fixtures as git test
repositories and writes paired corpus files to a caller directory. A local
stand-in rewrite is `test-repo-stand-in` evidence and is not counted.

`mechanical-edit-model-runs.ts` prepare/ingest scores captured baseline and
candidate trees as `model-run` evidence for an exact fast catalogue
candidate. It requires host tokens, named workers, and hidden checks, and
refuses a non-fast model and character-only usage. The host must accept that
exact id as a dispatchable model before the candidate arm. Inventory
membership and `--evaluation` resolve are not a run. A refused host id writes
no corpus scores and does not promote. It never asks the implementer whether
the work is menial. Public rankings and unscored fixtures never promote.

`record-routing.ts persist` requires an explicit outcome file validated
against the outcome schema. A missing or invalid outcome is refused and
writes nothing; it is never stored as a successful result.
`record-skip.ts persist` records each scripted skipped worker under the same
run. The scorecard counts those skips and never estimates tokens saved. Skip
recording still runs when diagnostic profiling is off.

Usage files come from `capture-usage.ts`: start a timer before the worker,
finish after the outcome exists, overlay host tokens and cost only from a
host-written file, and otherwise record character counts of named artifacts.
Invalid usage is refused the same way as an invalid outcome. Scored corpus
entries record utility and critical misses for one exact candidate and task
class. Promotion reports keep `live` and `representative-run` evidence in
separate groups and never pool them.

In `always` profiling mode, persist profiles and shadow recommendations as
evaluation evidence. A cheaper shadow recommendation is recorded, never
dispatched.
