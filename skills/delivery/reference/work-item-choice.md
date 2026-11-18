# Choosing the work-item provider

Read this when `work-item-config.ts check` reports that the repository has no
saved provider choice, or when the operator asks to change it.

List the substantiated options with `work-item-config.ts options`. Always
include `local-files`; include a remote provider only when the runtime
advertises that exact provider. Present the alternatives with the **Human
decision brief**, including local durability/portability versus remote
collaboration and integration trade-offs, recommend based on the repository's
needs, and ask the operator to confirm one.
Never infer from remotes, credentials, host, environment, or reference shape.
After explicit confirmation, configure the exact id. Replacing an existing
choice additionally requires `--replace`:

```
bun "${FACTORY_ROOT}/scripts/work-item-config.ts" configure \
  "$(git rev-parse --show-toplevel)" <provider-id> \
  "${FACTORY_ROOT}/runtime-manifest.json" [--replace]
```
