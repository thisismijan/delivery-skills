# Factory runtime

This `factory/` directory is the portable delivery runtime: gate scripts,
subagent prompts, and capability specs. The installer copies it beside the
skills as `_factory/`.

## Prerequisites

The runtime needs a writable target repository for `.delivery/` and
`.review/`, subprocess execution for deterministic gates, an enforceable
mutation boundary before mutating stages (read-only stages still run without
it), and forge, tracker, or review-publication capabilities only when a stage
reaches them. A missing capability stops with that gap, completed work intact,
and a configuration remedy. Do not invent a tool the host did not expose.

Every install writes `runtime-manifest.json` here. Setup checks it from the
target repository with `scripts/doctor.ts`, `scripts/work-item-config.ts
options`, and `scripts/delivery-init.ts`; init never infers a provider from
remotes or credentials. The SDLC constitution (`SDLC-CONSTITUTION.md`) is
required on every run; a missing or mismatched constitution is a terminal
stop, and `bun "$FACTORY_ROOT/scripts/sdlc-constitution.ts" preflight`
verifies it alone. After plan approval, later stages also check
`.delivery/runs/<id>.run-contract.json`.

## Resolve FACTORY_ROOT

Try these locations in order and take the first that fits:

1. `$DELIVERY_FACTORY_ROOT`, provided `scripts/find-change.ts` exists inside it.
2. `../_factory` next to the skill. Resolve the real path of the skill's
   `SKILL.md` first, following any symlinks, and step up from that skill
   directory. This is how an installed pack is laid out, with
   `<skills-dir>/<skill>` and `<skills-dir>/_factory` side by side.
3. `../../factory` from that same real skill directory. This is how a clone
   is laid out before anything is installed.
4. `$FACTORY_ROOT`, provided it is already exported and `scripts/find-change.ts`
   exists inside it.

If none of them fits, stop and tell the operator to clone this pack and run
`./install.sh --skills-dir <path>`.

Export the result so every later step of the run sees it:

```bash
export FACTORY_ROOT='<resolved>'
```

The gate scripts read this directory from `FACTORY_ROOT`, and fall back to the
parent of `scripts/` when it is unset. Read this file once per run.

## Running factory scripts

Learn a provider command's inputs with
`bun "$FACTORY_ROOT/scripts/<command>.ts" --help`: `forge-provider`,
`work-item-provider`, `review-fanout`, and `forge-comments` print every
operation's input shape. Other scripts print their usage when run without
arguments. Never read a script's source to learn how to call it. Read it only
to diagnose a failure the script's own message does not explain.

Run test gates with `test-gate.ts ... --out <report.json>`, which keeps the
full report in that file and prints a short summary. Run lint, typecheck, and
any other command whose full output you do not need with
`bun "$FACTORY_ROOT/scripts/quiet-run.ts" <log-file> -- <command> [args...]`.
It exits with the command's code and prints only the lines that name a
failure and the end of the run. When that is not enough, read the log by line
range rather than running the command again.

## Dispatching subagents

Every factory skill loads `$FACTORY_ROOT/agents/<name>.md` and gives that
prompt to the runtime's `agent.dispatch` capability. Do not invent a cheaper
substitute prompt. When the host provides a subagent of that exact name, as a
plugin install does, dispatch it rather than a generic one carrying the
prompt, so the host enforces the permissions it declares. Pass the model the
step resolved.

For a continuous-delivery wave, `agent.dispatch` must support isolated mutating
workers with an explicit cwd and environment. The conductor creates one git
worktree per independent ticket and starts every worker before awaiting one.
Each worker receives `DELIVERY_WORKER_JOURNAL` and writes only that journal;
the parent coordinator alone updates the run ledger. A runtime that cannot
provide this isolation reports the missing capability and runnable worktree
commands. It must not silently execute an independent wave sequentially.

## Providers

Native review commands, hooks, forge wrappers, tracker setup, and spec tooling
live in optional adapters or providers. Generic skills never call those
wrappers. Change inspection and review publication use one command:

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
dependencies. Never call a host tool that the plan did not name. Never call a
tool that merges, closes, approves, deletes, resolves threads, or transitions
work-item status.

Host tools are recorded in `.delivery/runtime/mcp-inventory.json` with
`scripts/mcp-inventory.ts`. Doctor always records them. At the start of a run,
first run `bun "$FACTORY_ROOT/scripts/mcp-inventory.ts" fresh "<repoRoot>"`.
Exit 0 means the recorded inventory is recent: reuse it and do not list the
host's tools again. Otherwise record them. When a planned host tool turns out
to be missing or unauthenticated, record the inventory again and plan again.

After a normalized `read`, include its exact full head revision as
`headRevision` in every `files`, `diff`, `commits`, `discussions`, and
`anchors` input. Session-tool evidence without that binding is refused instead
of being labelled with a placeholder.

Operations are `find`, `read`, `pipeline`, `files`, `diff`, `commits`, `discussions`,
`anchors`, `approvals`, `create`, `set-draft`, `note`, `reply`, `land`, `failures`, and `retry`.
Inputs are JSON files. `note` and `reply` name a body file under the target
repository's `.review/` directory; the command checks that path before any
adapter. Mutations require `"approved": true`. A dry-run uses `"dryRun": true`
and must not set `"approved": true`. The interface does not expose merge,
close, delete, approve, or thread resolution; humans own those actions. The
one exception is `land`: inside a continuous auto run it squash-merges a
change only after its own gate holds (see `skills/delivery/workflows/auto.md`).
It runs only through the executable adapter, never through session tools.
`retry` is gated the same way: it reruns a failed pipeline once, only when
every failed job is known infrastructure and the run contract allows it (see
`skills/delivery/workflows/pipeline-monitoring.md`). `failures` reads the
failed jobs it decides from.

`forge.change` and `review.publish` must advertise the same provider. A
missing, mismatched, or failed capability is a terminal stop with a
configuration remedy. Session tools may satisfy those capabilities when the
recorded inventory maps every required operation.

When a stage fans out review lenses, read
`$FACTORY_ROOT/reference/review-fanout.md` first.

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
5. Unpromoted `fast` candidates are `evaluation-only`. Never dispatch one in
   live delivery. To evaluate, register, or promote a fast model, score a
   mechanical edit, or record routing evidence, read
   `$FACTORY_ROOT/reference/model-evaluation.md`.

Diagnostic shadow profiling is opt-in. Read `routingProfiling` from
`bun "$FACTORY_ROOT/scripts/config.ts"`; it defaults to `off` and is enabled
only when `ROUTING_PROFILING=always`. In `off` mode, skip the
`task-profile-controller` call and its dependent usage, persistence, and
scorecard telemetry. Live model selection, implementation, holdout review of
new or changed code, and every quality gate remain unchanged.

The catalogue is ordered policy. Runtime availability chooses among catalogue
candidates; it never lowers safety floors.

## Where behaviour changes belong

Behavioural changes belong in this runtime, then flow to installed skills
through `./install.sh --skills-dir <path>`. Do not load a second factory in the
same session: two runtimes will fight.
