## Context

`review-fanout.ts measure` already counts code-only lines, but surfaces and
the bar check are still the model's job. Both are lists of path and line
patterns written in prose in `release-readiness.md`.

## Goals / Non-Goals

**Goals:**

- Mark the surfaces and bar hits that paths and changed lines prove, for
  TypeScript, Python, and Java.
- Over-detect rather than under-detect. A false mark costs one extra lens; a
  missed mark skips one.
- Fail closed on a diff the parser cannot read.

**Non-Goals:**

- Replacing the lenses, the door call, or severity. The scan reports
  evidence; the model still judges it.
- Deciding whether a hit is explained by the MR description or `design.md`.

## Decisions

- **Floor, not ceiling.** The scan's surfaces and hits are the minimum. The
  model can add a surface it proves from the diff, but dropping a scripted
  mark is not allowed. This keeps the cost saving without letting a
  cheaper read lower the bar.
- **Same exclusions as `measure`.** OpenSpec, `.delivery/`, and `.review/`
  paths are left out and reported, so a spec's YAML is never a Config
  surface.
- **One-way signals force a one-way call.** Destructive SQL (drop, truncate,
  delete) in an added line marks the door one-way. The model may still call
  a change one-way on other evidence.
- **Assertions are counted per file.** A test file whose removed assertion
  lines outnumber its added ones is a hit. Rewording an assertion in place is
  not.
- **Thresholds compare numbers on the same key.** A removed
  `coverage`/`threshold`/`fail_under`/`minimum` value replaced by a smaller
  one, or removed with no replacement, is a hit.

## Risks / Trade-offs

- [Pattern gaps for unusual layouts] → the model still adds marks; the scan
  never removes them.
- [Noise from broad auth and config path words] → over-detection only turns
  on lenses that would have run for a larger change anyway.
