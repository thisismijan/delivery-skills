## Context

Forge suggestion notes are a fence whose body is the replacement text.
Once applied, that text is in the file. The comment-assessor does not
need to say so.

## Goals / Non-Goals

**Goals:**

- Suggestion-only comments whose text is already in the file skip the
  assessor as outdated.

**Non-Goals:**

- Applying the suggestion.
- Matching HTML-rendered suggestion notes.

## Decisions

- **Whole body must be one suggestion fence.** Extra review prose stays
  in scope.
- **Substring match on the head file.** Fail closed when the path was
  not looked up, the comment is unanchored, or the text is absent.

## Risks / Trade-offs

- [A short suggestion already existed elsewhere in the file] → the
  comment is treated as outdated. Reviewers still see the resolved
  thread.
