## 1. Script

- [x] 1.1 Squash, rebase onto the target, and push with the read head as the lease
- [x] 1.2 Stop on real conflicts with the files listed, and finish with `push`
- [x] 1.3 Report a moved remote branch without pushing

## 2. Auto

- [x] 2.1 Run the update when conflicts are the only stop reason
- [x] 2.2 Rerun the green gate and a delta review on the new head

## 3. Verify

- [x] 3.1 Tests against a real remote for clean, conflicted, moved, dirty, and bad-argument cases
- [x] 3.2 `bun run check` and `bun run test` pass
