# OpenSpec spec-tool provider

Selected with `./install.sh --skills-dir <path> --provider openspec`.

File-based plans, tasks, and evidence stay in the generic core. This provider
covers the OpenSpec CLI. Generic install does not assume the CLI is present.
Install `openspec` on `PATH` (same major as the bundled archive skill) before
`/delivery archive`. Doctor reports live CLI readiness. This overlay does not
advertise forge or tracker capabilities.

The **target** repository needs its own `openspec/` tree when draft authors a
change. Archive only after a human merges. The bundled
`skills/openspec-archive` skill must not run as a substitute during execute.
