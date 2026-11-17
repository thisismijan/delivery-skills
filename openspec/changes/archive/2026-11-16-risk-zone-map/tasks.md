## 1. Map

- [x] 1.1 Parse `.delivery/zones` from the main checkout, failing closed on a malformed line
- [x] 1.2 Match plain paths as folders and globs with the runtime's glob matcher

## 2. Review

- [x] 2.1 Report zone hits in `diff-scan.ts` only when a map exists
- [x] 2.2 Run every lens for a change with red-zone paths
- [x] 2.3 Tell `/code-review-max` to pass red paths as `redZones`

## 3. Build approval

- [x] 3.1 Add `risk-zones.ts check` over planned paths and recorded approvals
- [x] 3.2 Stop `/execute` and auto on exit 3 until a person approves
- [x] 3.3 Document the map and the gate in the reference

## 4. Verify

- [x] 4.1 Tests for parsing, matching, unchanged no-map output, fan-out, approval, yellow, a worktree, and the CLI
- [x] 4.2 Raise the two grown skill ceilings
- [x] 4.3 `bun run check` and `bun run test` pass
