## Context

This Cursor enablement lists Auto, Grok 4.6, several Opus and Gemini
workers, Muse Wonder, Muse Spark 1.3, Claude Sonnet 5.5, Claude Haiku
5.5, and others. Composer is absent. Haiku scoring already used
`claude-haiku-5-5-medium` while recording catalogue id `haiku`.

## Goals / Non-Goals

**Goals:**

- Dispatch the host id for a live catalogue row when the inventory names
  an alias.
- Keep Composer evaluation-only.

**Non-Goals:**

- Promoting Composer.
- Registering every enabled UI name as a new catalogue row.
- Treating a later version id as the scored candidate.

## Decisions

- **Return the advertised string.** `cursor-agent --model haiku` fails.
  Resolve must return `claude-haiku-5-5-medium` when that is what the
  inventory contains.
- **Aliases do not change availability.** An evaluation-only row stays
  blocked on live resolve even if an alias is advertised.
- **Unknown labels stay out of the catalogue.** Grok, GPT, Kimi, GLM,
  DeepSeek, Gemini 3.x, and Opus 4.6/4.7 can join later as exact ids.
  Display names and Auto are not ids.

## Risks / Trade-offs

- [A new Haiku version id] → new candidate, new scores, not this alias.
