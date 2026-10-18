# Work-item providers

Each target repository confirms one provider in
`.delivery/work-items.json`. Delivery never chooses from a git remote,
credential, host name, environment variable, or reference shape.

List the choices substantiated by the installed runtime:

```bash
bun "$FACTORY_ROOT/scripts/work-item-config.ts" options \
  "$FACTORY_ROOT/runtime-manifest.json"
```

Then confirm one through `/delivery init`, or directly:

```bash
bun "$FACTORY_ROOT/scripts/delivery-init.ts" --work-items <provider-id>
```

Changing an existing choice requires a second explicit confirmation and
`--replace`. Selection does not migrate or mutate existing work items.

## Local files

`local-files` is always available. Approved items live under
`.delivery/work-items/` and use normalized keys such as `LOCAL-1`. No network
service or remote tracker capability is required.

## Jira and forge issues

Jira, GitLab issues, GitHub issues, and other remote systems appear only when
the runtime advertises an available `tracker.item` capability with an exact
`provider` id and invocation. A forge remote by itself does not enable forge
issues. If a saved remote provider is unavailable in a later session, delivery
stops rather than falling back to local files.

## Custom providers

A custom adapter uses a lowercase provider id and implements normalized
work-item read, create, link, and note operations behind `tracker.item`.
Credentials stay in the host integration. Human-owned status transitions
remain outside delivery regardless of provider.
