## Context

Reviewers sometimes leave a thumbs-up or a reaction shortcode. That is
not a finding to classify.

## Goals / Non-Goals

**Goals:**

- A body that is only emoji or reaction shortcodes skips the assessor
  as outdated.

**Non-Goals:**

- Treating ASCII emoticons or mixed review text as outdated.

## Decisions

- **Whole body must be emoji.** Extra prose stays in scope.

## Risks / Trade-offs

- [A reviewer used emoji as the whole review] → mixed text still uses
  the assessor.
