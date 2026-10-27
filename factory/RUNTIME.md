# Factory runtime

This `factory/` directory is the portable delivery runtime: gate scripts,
subagent prompts, and capability specs. The installer copies it beside the
skills as `_factory/` so a host that can load skills can also resolve the
runtime without a named product layout.

## Prerequisites

The runtime is bounded. It needs:

- A writable target repository for `.delivery/` and `.review/` artifacts.
- Subprocess execution for deterministic gates. A text-only chat cannot run
  tests, write ledgers, or enforce verdicts.
- An enforceable mutation boundary before mutating stages. Read-only stages
  remain available when that guard is absent; mutating stages stop closed.
- Provider capabilities for forge, tracker, and review publication only when a
  stage reaches those boundaries. A missing provider stops with completed work
  intact.

If a required capability is missing, stop with that gap and a configuration
remedy. Do not invent a tool the host did not expose.

Every install writes `runtime-manifest.json` in this directory. The generic
manifest is complete and fail closed; selected adapters and providers overlay
only capabilities their setup can substantiate. Check the installation from
inside the target repository:

```
bun "$FACTORY_ROOT/scripts/doctor.ts"
bun "$FACTORY_ROOT/scripts/work-item-config.ts" options \
  "$FACTORY_ROOT/runtime-manifest.json"
bun "$FACTORY_ROOT/scripts/delivery-init.ts" --work-items <confirmed-provider-id>
```

Doctor reports ready capabilities, the repository's confirmed work-item
provider, setup remedies, host limitations, and human-owned actions separately.
It distinguishes read-only lifecycle from full lifecycle. Init persists that
explicit provider choice, adds `.delivery/` and `.review/` to `.gitignore`
once, and then reprints only unresolved doctor checks. It never infers a
provider from remotes or credentials. The SDLC constitution
(`SDLC-CONSTITUTION.md`) remains required on every run; a missing or mismatched
constitution is a terminal stop. After plan approval, later stages also check
`.delivery/runs/<id>.run-contract.json`.

For constitution-only verification, run
`bun "$FACTORY_ROOT/scripts/sdlc-constitution.ts" preflight`.

## Resolve FACTORY_ROOT

Use the first match:

1. `$DELIVERY_FACTORY_ROOT` when it contains `scripts/find-change.ts`.
2. The real path of this skill's `SKILL.md` (follow symlinks), then
   `../_factory` from that skill directory. This is the installed-pack layout
   (`<skills-dir>/<skill>` beside `<skills-dir>/_factory`).
3. From the same real skill directory, `../../factory`. This is the clone
   layout before installation.
4. `$FACTORY_ROOT` when it is already exported and contains `scripts/find-change.ts`.

Stop if none match: clone this pack and run
`./install.sh --skills-dir <path>`.

Export for the rest of the run:

```bash
export FACTORY_ROOT='<resolved>'
```

Gate scripts resolve this directory from `FACTORY_ROOT` or default to the parent
of `scripts/`.

## Subagents

Every factory skill loads `$FACTORY_ROOT/agents/<name>.md` and gives that
prompt to the runtime's `agent.dispatch` capability. Do not invent a cheaper
substitute prompt.

For a continuous-delivery wave, `agent.dispatch` must support isolated mutating
workers with an explicit cwd and environment. The conductor creates one git
worktree per independent ticket and starts every worker before awaiting one.
Each worker receives `DELIVERY_WORKER_JOURNAL` and writes only that journal;
the parent coordinator alone updates the run ledger. A runtime that cannot
provide this isolation reports the missing capability and runnable worktree
commands. It must not silently execute an independent wave sequentially.

## Providers

Stage invocations are identical on every conforming runtime. Native review
commands, hooks, forge wrappers, tracker setup, and spec tooling live in
optional adapters or providers selected during installation.

Generic skills never call those wrappers. Change inspection and review
publication use one command:

```
bun "$FACTORY_ROOT/scripts/forge-provider.ts" <operation> <repoRoot> \
  "$FACTORY_ROOT/runtime-manifest.json" [input.json]
```

Before that subprocess, plan the transport:

```
bun "$FACTORY_ROOT/scripts/forge-provider.ts" plan <operation> <repoRoot> \
  "$FACTORY_ROOT/runtime-manifest.json" [input.json]
```

If the plan names `transport: "mcp"`, call only the returned host tool with the
returned arguments, write the raw JSON, then normalize:

```
bun "$FACTORY_ROOT/scripts/forge-provider.ts" normalize <operation> \
  <provider> <raw.json> [input.json]
```

Work items use the same plan/normalize pair on
`scripts/work-item-provider.ts`, including the original input file when
normalizing a mutation. A create, link, or note returns a receipt; read the
affected item afterwards when later decisions need its current fields or
dependencies. Record available host tools at doctor and at
the start of a run with `scripts/mcp-inventory.ts`. Never call a host tool that
the plan did not name. Never call a tool that merges, closes, approves, deletes,
resolves threads, or transitions work-item status.

After a normalized `read`, include its exact full head revision as
`headRevision` in every `files`, `diff`, `commits`, `discussions`, and
`anchors` input. Session-tool evidence without that binding is refused instead
of being labelled with a placeholder.

Operations are `find`, `read`, `pipeline`, `files`, `diff`, `commits`, `discussions`,
`anchors`, `create`, `set-draft`, `note`, and `reply`. Inputs are JSON files.
`note` and `reply` name a body file under the target repository's `.review/`
directory; the command checks that path before any adapter. Mutations require
`"approved": true`. A dry-run uses `"dryRun": true` and must not set
`"approved": true`. The interface does not expose merge, close, delete,
approve, or thread resolution; humans own those actions.

`forge.change` and `review.publish` must advertise the same provider. A
missing, mismatched, or failed capability is a terminal stop with a
configuration remedy. Session tools may satisfy those capabilities when the
recorded inventory maps every required operation.

## Runtime model inventory

The runtime, not this repository, is the source of truth for which models the
current session may use. At the start of a factory run:

1. Read the exact model identifiers advertised by the current runtime. Never
   probe by repeatedly dispatching invalid names and never invent a model that
   the runtime did not advertise.
2. Persist this JSON to `<target repo>/.delivery/routing/model-inventory.json`:
   `{"version":1,"recordedAt":"<ISO time>","models":["<exact id>", "..."]}`.
3. Determine the required capability tier from the workflow first. Then run
   `bun "$FACTORY_ROOT/scripts/model-catalogue.ts" resolve <tier> <inventory>`.
   Dispatch the returned exact model identifier, overriding an agent prompt's
   static `model:` value. That frontmatter is a portable fallback only when the
   runtime cannot override models.
4. A missing model for the required tier is a terminal capability failure. Do
   not silently choose a model from another tier.
5. Unpromoted `fast` candidates are `evaluation-only`. They may be
   resolved with `--evaluation` for corpus benchmarking. Register a new
   exact id with `model-catalogue.ts register-fast <id>`. Promote with
   `fast-dispatch.ts promote <corpus> <id> --approve <id>`. Live delivery
   may resolve a catalogue-live fast id without `--evaluation`. A later
   version id does not inherit scores.
   `fast-dispatch.ts` still gates the exact candidate and task class on
   representative-run scores. Live scores are never mixed into that
   sample. Fewer than five cases, a mean below the 90 percent bar, or any
   critical miss keeps an unpromoted model evaluation-only. Named safety
   floors block auth, migration, concurrency, distributed-state,
   weak-verification, and holdout work even after the bar clears. Passing
   evidence does not change live availability without an exact operator
   promotion approval naming that candidate. A classified mechanical-edit may
   be scored for later graduation. The command classifies it with
   `mechanical-edit.ts` and applies proven TypeScript, Python, and Java
   rename, import-only, and format-only units with `apply-mechanical-edit.ts`.
   Units the scripts cannot prove are listed in `mechanical-edit-scoring.ts`
   for representative scoring only. `mechanical-edit-test-repos.ts`
   materializes those fixtures as git test repositories and writes paired
   corpus files to a caller directory. A local stand-in rewrite is
   `test-repo-stand-in` evidence and is not counted.
   `mechanical-edit-model-runs.ts` prepare/ingest scores captured baseline
   and candidate trees as `model-run` evidence for an exact fast catalogue
   candidate. It requires host tokens, named workers, and hidden checks,
   and refuses a non-fast model and character-only usage.
   It never asks the
   implementer whether the work is menial. Public rankings and unscored fixtures never promote.
   `record-routing.ts persist` requires an explicit outcome
   file validated against the outcome schema. A missing or invalid outcome is
   refused and writes nothing; it is never stored as a successful result.
   Usage files come from `capture-usage.ts`: start a timer before the worker,
   finish after the outcome exists, overlay host tokens and cost only from a
   host-written file, and otherwise record character counts of named artifacts.
   Invalid usage is refused the same way as an invalid outcome. Scored
   corpus entries record utility and critical misses for one exact candidate and
   task class. Promotion reports keep `live` and `representative-run` evidence in
   separate groups and never pool them.

Diagnostic shadow profiling is opt-in. Read `routingProfiling` from
`bun "$FACTORY_ROOT/scripts/config.ts"`; it defaults to `off` and is enabled
only when `ROUTING_PROFILING=always`. In `off` mode, skip the
`task-profile-controller` call and its dependent usage, persistence, and
scorecard telemetry. Live model selection, implementation, holdout review of
new or changed code, and every quality gate remain unchanged. In `always`
mode, persist profiles and shadow recommendations as evaluation evidence.
A cheaper shadow recommendation is recorded, never dispatched.

Independently adjudicated `/code-review-max` lenses use the resolved
`standard` model. Write measured counts and surfaces to
`.review/mr-<iid>/<full-head-sha>/review-fanout-input.json`, then run
`bun "$FACTORY_ROOT/scripts/review-fanout.ts" <that file>`. The returned
`lenses` array is authoritative. A small reversible change, or a contained one
(reversible, at most 6 files and under 400 lines, no sensitive surface or
dependency change), runs two essential lenses; larger, one-way, sensitive, or
unknown classification runs all four.
Invalid input is a terminal stop. Counts come from
`review-fanout.ts measure <base> <head>`, which leaves out OpenSpec and
delivery artefacts. `review-fanout.ts adjudication <candidates.json>` decides
who verifies the lens candidates: nobody when there are none, one standard-tier
subagent when all are Low, and the main conversation when any is Medium or
above.

Surfaces, one-way signals, and lowered-bar hits start from
`bun "$FACTORY_ROOT/scripts/diff-scan.ts" <base> <head>`, used by
`/code-review-max` and release readiness. Its marks are a floor that the model
may add to and never remove. A non-zero exit stops the stage.

The catalogue is ordered policy. Runtime availability chooses among catalogue
candidates; it never lowers safety floors.

## Provenance

Behavioural changes belong in this runtime, then flow to installed skills
through `./install.sh --skills-dir <path>`. Do not load a second factory in the
same session: two runtimes will fight.
