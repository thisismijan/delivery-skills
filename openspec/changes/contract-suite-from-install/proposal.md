## Why

From an installed skills directory, the delivery contract suite showed 4
failures and 2 errors, while the same files passed from a checkout (177
tests). The pack tests looked for `factory/` beside `skills/`, but an install
puts the factory at `_factory/` inside the skills directory. A few tests also
read `README.md` and `adapters/`, which are not installed at all. `/delivery
improve` evaluates in place, so it had to copy the checkout to `/tmp` to get
a green baseline.

## What Changes

- The suite finds the factory scripts at `factory/` in a checkout or
  `_factory/` in an install, so those tests run against what is installed.
- The groups that need checkout-only files are skipped from an install, and
  the skipped test's name gives the reason: the "portable factory pack" docs
  checks, and the copy-the-pack historical-independence check.
- A new factory test installs into a scratch directory and runs the suite
  there. It requires zero failures and zero errors, and a reason on every
  skip.
- `improve.md` says the baseline suite runs in place from an install.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `generic-skill-packaging`: the contract suite runs from an install.

## Impact

- `skills/delivery/checks/delivery-specs.test.ts`, new
  `factory/scripts/installed-contract-suite.test.ts`,
  `skills/delivery/workflows/improve.md`
