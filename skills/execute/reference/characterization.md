# Characterization pass

This applies at step 3c when `characterize.ts check` exits 3 and lists `pinned` files.

Before step 4, dispatch the `test-writer` in characterization mode with those
files and the code map, to pin what they do today. Run its tests with
`bun "${FACTORY_ROOT}/scripts/test-gate.ts" "<reviewDir>/characterize-command.json" green --out "<reviewDir>/characterize-gate-<commit>.json"`; they
must pass on the current code. Commit them alone as
`test: characterize current behaviour` before the change's tests, and keep
them out of the red gate. A failing run stops + escalates.
