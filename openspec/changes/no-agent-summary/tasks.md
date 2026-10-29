## 1. Tests

- [x] 1.1 Prove settings merge keeps unrelated env and existing BUN_OPTIONS flags, and refuses a relative preload path.
- [x] 1.2 Prove Claude adapter setup copies the preload and writes it into live settings.
- [x] 1.3 Prove the vendored hook only installs inside a compiled Bun image and names the summary timer anchors.
- [x] 1.4 Prove doctor reports the preload as setup when it is missing and ready when it is present, without blocking stages.

## 2. Implementation

- [x] 2.1 Vendor the preload in the Claude adapter and copy it during setup.
- [x] 2.2 Merge `--preload` into Claude settings `env.BUN_OPTIONS`.
- [x] 2.3 Report it from doctor and name the restart in the adapter README.
