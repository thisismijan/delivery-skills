# Factory runtime

This `factory/` directory is the portable ig-spec factory: gate scripts, subagent
prompts, and capability specs. It is not a Claude Code plugin. Cursor and Claude
Code both load the skills under `skills/` and resolve this directory the same way.

## Resolve FACTORY_ROOT

Use the first match:

1. `$DELIVERY_FACTORY_ROOT` when it contains `scripts/find-change.ts`.
2. The real path of this skill's `SKILL.md` (follow symlinks), then
   `../_factory` from that skill directory. This is the Cloud Agent store
   layout (`skills/<skill>` beside `skills/_factory`).
3. From the same real skill directory, `../../factory`. This is the clone and
   desktop-symlink layout.
4. `$CLAUDE_PLUGIN_ROOT` when it contains `scripts/find-change.ts`.

Stop if none match: clone `delivery-skills` and run `./install.sh`.

Export both for the rest of the run:

```bash
export FACTORY_ROOT='<resolved>'
export CLAUDE_PLUGIN_ROOT="$FACTORY_ROOT"
```

Gate scripts still read `CLAUDE_PLUGIN_ROOT` and otherwise default to the parent
of `scripts/`, which is this directory.

## Subagents

Claude Code plugins auto-load `agents/*.md`. Cursor does not. Every factory
skill must `Read` `$FACTORY_ROOT/agents/<name>.md` and give that prompt to the
subagent. Do not invent a cheaper substitute prompt.

## Host

Factory commands (`/groom`, `/draft`, `/execute`, `/address-comments`) are
identical on Cursor and Claude Code. Host-specific behaviour lives only in
review: Cursor uses `/code-review-max`; Claude Code may use native
`/code-review max` when present, otherwise the same `/code-review-max` skill.

## Runtime model inventory

The host, not this repository, is the source of truth for which subagent models
the current account may use. At the start of a factory run:

1. Read the exact model identifiers advertised by the current runtime. Cursor
   supplies them in the session's subagent model list. Claude Code supplies its
   accepted aliases. Never probe by repeatedly dispatching invalid names and
   never invent a model that the runtime did not advertise.
2. Persist this JSON to `<target repo>/.delivery/routing/model-inventory.json`:
   `{"version":1,"host":"cursor|claudeCode","recordedAt":"<ISO time>","models":["<exact id>", "..."]}`.
3. Determine the required capability tier from the workflow first. Then run
   `bun "$FACTORY_ROOT/scripts/model-catalogue.ts" resolve <tier> <inventory>`.
   Dispatch the returned exact model identifier, overriding an agent prompt's
   static `model:` value. That frontmatter is a portable fallback only when the
   host cannot override models.
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
   fixtures never promote. `record-routing.ts persist` requires an explicit outcome
   file validated against the outcome schema. A missing or invalid outcome is
   refused and writes nothing; it is never stored as a successful result. Scored
   corpus entries record utility and critical misses for one exact candidate and
   task class. Promotion reports keep `live` and `representative-run` evidence in
   separate groups and never pool them.

The catalogue is ordered policy. It currently recognises Muse Wonder as a
frontier model and Muse Spark as a fast evaluation candidate. Runtime
availability chooses among catalogue candidates; it never lowers safety floors.

## Provenance

Vendored from the internal ig-spec plugin so delivery does not depend on
`/plugin install ig-spec`. Behavioural changes belong here, then flow to both
hosts through `install.sh`. Do not load the original Claude plugin in the same
session: two factories will fight.
