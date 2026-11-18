# Review lenses

Every review-lens and focused-pass subagent reads this file with its brief. It holds each lens's checks, the candidate format, and the report contract.

## The four lenses

1. **Correctness and security**
   - Trace changed control and data flow.
   - Check boundary validation, authentication and authorization, secrets,
     injection, unsafe defaults, and contract compatibility.
2. **Tests and specification**
   - Map every acceptance criterion and changed behaviour to an executed test.
   - Check that tests would fail on the likely incorrect implementations.
   - Look for skipped, deleted, weakened, tautological, or implementation-coupled
     tests.
3. **Reliability and operations**
   - Check failure paths, retries, idempotency, partial completion, concurrency,
     resource cleanup, migrations, rollout compatibility, observability, and
     rollback.
4. **Repository standards and blast radius**
   - Apply the repository's actual rules.
   - Trace callers and consumers outside the diff.
   - Check types, browser/server boundaries, generated artifacts, configuration,
     CI selection, and dependency changes.
   - Check whether the diff adds a dependency, abstraction, wrapper, option,
     conversion, configuration knob, or duplicated capability when an existing
     repository or platform capability already satisfies the requirement.
     Report it only when the extra machinery has a concrete cost such as a
     larger public surface, additional failure path, duplicated logic, or
     operational burden. Never trade away validation, security, accessibility,
     data-loss protection, required error handling, or accepted boundary
     behaviour merely to reduce code.

## Candidate format

Each candidate finding must contain:

- Severity: `Critical`, `High`, `Medium`, or `Low`, by the Severity rules in the brief.
- `path:line` at the head SHA.
- The concrete bad behaviour.
- A reproducible input, sequence, or failure condition.
- Evidence from code, a test, or a command.
- The smallest reasonable fix direction.
- Which requirement or repository rule it violates.

Return `NO FINDINGS` when there are none. Do not include praise, style
preferences, or speculative future requirements.

## Report contract

Every lens report ends with the line `Examined files:` followed by one
`- <path>` line per file, or `Examined files: none`. A `NO FINDINGS` report
carries it too. A path is copied exactly as the brief's changed-path list
writes it. A file counts as examined only when the lens read the changed lines
in the pinned diff or the file at the head. For a deleted file, which has no
head copy, that means reading its removed lines in the pinned diff. Naming a
path from the brief or a diff header is not reading. A lens never lists a
binary file.
