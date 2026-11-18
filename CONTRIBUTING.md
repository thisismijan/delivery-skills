# Contributing

```bash
cd factory
bun install --frozen-lockfile
bun run check
bun run test
```

`bun run test` runs the factory tests and then the delivery skill's own
checks under `skills/delivery/checks`. A bare `bun test` runs only the
factory tests, so use the script. `bun run test:skills` runs the skill checks
alone.

Every merge request runs the same `bun run check` and `bun run test` in
`.gitlab-ci.yml`, on the Bun version pinned in `factory/package.json`.

Use Bun `1.4.2`. Conventional Commits (`feat:`, `fix:`, `docs:`, `test:`,
`chore:`, `refactor:`). Do not attribute commits or merge requests to an AI
or tool. `scripts/commit-guard.ts` blocks that attribution plus merge, close,
force-push, hard reset, and tracker mutation.

## Generic boundary

`skills/`, `factory/agents/`, `factory/reference/`, `factory/RUNTIME.md`,
and `factory/CONVENTIONS.md` must not name hosts, forges, trackers, or the source
framework. Product setup belongs in `adapters/` and `providers/`. Operator
guides that name products belong in `docs/` and those README files.

`openspec/changes/archive/` is historical change evidence, not a user manual.

## Skill size

Keep each `SKILL.md` body under the recommended 5,000 tokens. Aim for about
4,500 by an OpenAI tokenizer such as cl100k, because Claude counts roughly 10 to
20 percent higher.

`bun run test` fails when a `SKILL.md` grows past its ceiling in
`factory/skill-size-ceilings.json`. Slim the skill, or raise the ceiling with
`bun scripts/skill-size.ts raise skills/<name>/SKILL.md` in the same change.
After slimming, run the same command to lower the ceiling to the new size.

To slim a skill:

- Keep gates, stop conditions, hard rules, step headings and the commands every
  run uses in `SKILL.md`.
- Move material that only some runs need, such as re-entry paths, rare routes
  and profiling steps, into `skills/<name>/reference/<topic>.md`.
- Leave a one-line pointer at the spot it came from that names the trigger, for
  example execute's "On a resume or with prior state …, read
  `reference/re-entry.md`". When a moved procedure can stop the run, keep a
  short summary of its stop conditions next to the pointer, as that step does.
- Do not change a rule's meaning while moving it. Point the tests that pinned
  the moved text at the reference file, and assert that `SKILL.md` keeps the
  pointer.
- Before you delete a line as a duplicate, find the same rule stated elsewhere
  in the file.

## Providers and adapters

See [docs/extending.md](docs/extending.md). Docs-only changes do not need a
pack version bump.
