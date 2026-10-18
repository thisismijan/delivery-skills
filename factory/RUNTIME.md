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
bun "$FACTORY_ROOT/scripts/delivery-init.ts"
```

Doctor reports ready capabilities, setup remedies, host limitations, and
human-owned actions separately. Init adds `.delivery/` and `.review/` to
`.gitignore` once and then runs doctor. The SDLC constitution
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
5. `fast` candidates are `evaluation-only`. Availability does not approve
   them. They may be resolved with `--evaluation` for corpus benchmarking, but
   live delivery cannot use them until `fast-dispatch.ts` passes the exact
   candidate and task class on representative-run scores. Live scores are never
   mixed into that sample. Fewer than five cases, a mean below the 90 percent
   bar, or any critical miss keeps the model evaluation-only. Named safety
   floors block auth, migration, concurrency, distributed-state,
   weak-verification, and holdout work even after the bar clears. Passing
   evidence does not change live availability without an exact operator
   promotion approval naming that candidate. Public rankings and unscored
   fixtures never promote.    `record-routing.ts persist` requires an explicit outcome
   file validated against the outcome schema. A missing or invalid outcome is
   refused and writes nothing; it is never stored as a successful result.
   Usage files come from `capture-usage.ts`: start a timer before the worker,
   finish after the outcome exists, overlay host tokens and cost only from a
   host-written file, and otherwise record character counts of named artifacts.
   Invalid usage is refused the same way as an invalid outcome. Scored
   corpus entries record utility and critical misses for one exact candidate and
   task class. Promotion reports keep `live` and `representative-run` evidence in
   separate groups and never pool them.

The catalogue is ordered policy. Runtime availability chooses among catalogue
candidates; it never lowers safety floors.

## Provenance

Behavioural changes belong in this runtime, then flow to installed skills
through `./install.sh --skills-dir <path>`. Do not load a second factory in the
same session: two runtimes will fight.
