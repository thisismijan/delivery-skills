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

Use Bun `1.4.2`. Conventional Commits (`feat:`, `fix:`, `docs:`, `test:`,
`chore:`, `refactor:`). Do not attribute commits or merge requests to an AI
or tool. `scripts/commit-guard.ts` blocks that attribution plus merge, close,
force-push, hard reset, and tracker mutation.

## Generic boundary

`skills/`, `factory/agents/`, `factory/RUNTIME.md`, and
`factory/CONVENTIONS.md` must not name hosts, forges, trackers, or the source
framework. Product setup belongs in `adapters/` and `providers/`. Operator
guides that name products belong in `docs/` and those README files.

`openspec/changes/archive/` is historical change evidence, not a user manual.

## Providers and adapters

See [docs/extending.md](docs/extending.md). Docs-only changes do not need a
pack version bump.
