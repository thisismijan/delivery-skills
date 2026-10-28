## Context

Reviewers sometimes paste a lone URL or a markdown link. That is a
pointer, not a finding.

## Goals / Non-Goals

**Goals:**

- A body that is only an HTTP URL, or only a markdown link, skips the
  assessor as outdated.

**Non-Goals:**

- Fetching the URL.
- Classifying HTML-only notes.

## Decisions

- **Whole body must be the URL or the link.** Extra prose stays in scope.

## Risks / Trade-offs

- [The URL was the entire review] → mixed text still uses the assessor.
