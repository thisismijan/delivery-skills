# OpenSpec spec-tool provider

Selected with `./install.sh --skills-dir <path> --provider openspec`.

File-based plans, tasks, and evidence stay in the generic core. This provider
covers the OpenSpec CLI and archive skill. Generic install does not assume the
CLI is present. Install `openspec` on `PATH` before archive; doctor reports its
live readiness. OpenSpec readiness does not advertise an unrelated runtime
capability.
