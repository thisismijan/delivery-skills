## Context

Max review already measures code-only diffs and skips lenses when that
count is zero. Release readiness still counted the whole diff, including
OpenSpec files, and always ran rollback in-conversation on the small
band.

## Goals / Non-Goals

**Goals:**

- Skip readiness-lens subagents on empty and proven small diffs.
- Skip the in-conversation rollback lens when there is no reviewable
  code.

**Non-Goals:**

- Changing which classified lenses run on a `full` change.
- Skipping the GO or NO-GO synthesis.

## Decisions

- **Reuse the review-fanout input.** Same counts, door call, and
  surfaces.
- **Small still runs rollback here.** Reverting a small code change can
  still leave runtime residue. An empty spec-only change cannot.

## Risks / Trade-offs

- [A binary file was excluded] → measure already counts binaries as one
  line, so they are never empty.
