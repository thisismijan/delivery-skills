# Extending

## Host adapter

Add `adapters/<name>/` with:

- `adapter.json` — capability overlay for the host
- `setup.sh` — install-time work (hooks, evidence file)
- `README.md` — how to invoke it
- optional `skill-overlay.md`

Mutation may be marked `enforced` only after setup verifies a real denial
hook. Static adapter JSON is not enough.

Generic skills and `factory/RUNTIME.md` must not name the host. See
[`CONTRIBUTING.md`](../CONTRIBUTING.md).

## Provider

Add `providers/<name>/` with `provider.json`:

```json
{
  "name": "<name>",
  "version": 1,
  "kind": "forge",
  "capabilities": ["forge.change", "review.publish"],
  "tools": ["<executable>"]
}
```

`kind` is `forge`, `tracker`, or `spec-tool`. Executables take one operation
argument and a version-1 JSON envelope on stdin, write JSON on stdout, and
must not invoke a shell or put secrets on argv. A tracker envelope carries
`settings` when the repository recorded any with
`delivery-init.ts --setting key=value`; settings are plain configuration, never
credentials.

Forge operations: `find`, `read`, `pipeline`, `files`, `diff`, `commits`, `discussions`,
`anchors`, `create`, `set-draft`, `note`, `reply`. Tracker operations:
`list`, `read`, `create`, `link`, `note`. Merge, close, status, and delete
stay human-owned.

## Readiness mapping today

`factory/scripts/provider-contract.ts` only overlays GitHub, GitLab, and Jira
executables. A third-party provider can still be invoked if you wire
`tracker.item` or `forge.change` yourself, but doctor and install overlay
will report “no portable readiness probe” until that mapping exists. Open a
change that adds the name to the contract; do not special-case it in generic
skills.

## Work-item selection

Custom tracker ids are lowercase. The operator still confirms them with
`/delivery init`. See [`factory/WORK-ITEMS.md`](../factory/WORK-ITEMS.md).
