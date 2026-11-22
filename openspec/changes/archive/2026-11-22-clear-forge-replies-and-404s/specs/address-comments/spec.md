## ADDED Requirements

### Requirement: The change's author counts as a factory author

When given `--change` with the normalized `read` or `find` result for the same
change, the comment filter SHALL treat an audit-prefixed reply by that change's
author as handling its thread, as it does for a configured factory author. It
SHALL refuse a change result for a different change. `/address-comments` and
release readiness SHALL pass the change they read.

#### Scenario: Reply posted from the operator's account

- **GIVEN** the operator's account opened the change and posted an audit reply on a thread
- **WHEN** the filter runs with `--change` for that change
- **THEN** that thread is not scoped again and release readiness does not count it as unanswered
