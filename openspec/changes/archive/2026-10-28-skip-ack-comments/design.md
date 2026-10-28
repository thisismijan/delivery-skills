## Context

Reviewers often leave a one-word acknowledgement. That is not a finding.

## Goals / Non-Goals

**Goals:**

- Exact acknowledgement bodies skip the assessor as outdated.

**Non-Goals:**

- Sentiment analysis of longer notes.

## Decisions

- **Closed list after trim and trailing punctuation.** Extra words stay
  in scope.

## Risks / Trade-offs

- [A sarcastic LGTM hid a real issue] → the list is fail-closed on extra
  text, so mixed notes still use the assessor.
