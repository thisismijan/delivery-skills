# Workflow: walkthrough

An opt-in check that the operator understands a change before they merge it.
The factory wrote the change; this asks the operator a few questions about it,
one at a time, and never gives the answer first. It is never a gate. Merging
stays the operator's decision, and nothing here changes a review or readiness
verdict.

Trigger: `/delivery walkthrough <iid>`.

## Steps

1. **Pin the change.** Write `{ "ref": "<ref>" }` and run
   `bun "${FACTORY_ROOT}/scripts/forge-provider.ts" read "<repoRoot>" "${FACTORY_ROOT}/runtime-manifest.json" <read-input.json>`.
   Take the head and base revisions and the source branch from it, and fetch
   both revisions without checking either out. A failed read stops with its
   message. The walkthrough holds for that head only.
2. **Find the topics.** The change folder is
   `openspec/changes/<source branch>` when it exists. Run
   `bun "${FACTORY_ROOT}/scripts/walkthrough.ts" topics "<repoRoot>" "<changeDir>" <base> <head>`.
   It lists hard-to-undo changes and risky surfaces from the diff, the
   acceptance scenarios, the alternatives the design turned down, and the
   source files that changed most, each with the file it comes from.
3. **Choose three to five topics.** Take a hard-to-undo change or risky surface
   when there is one, at least one acceptance scenario, and a turned-down
   alternative when the design names one. Before asking, read each cited file
   at the pinned head (`git show <head>:<path>`) so you know the answer. Never
   ask what those files do not answer.
4. **Say what will happen, once.** In one sentence: how many questions, one at
   a time, and that "just tell me" or "stop" works at any point. Then ask the
   first question.

## Asking

- Ask one question per message, and end the message with it. Add no hint,
  options, example answer, or explanation after the question.
- Mix the kinds of question: predict what happens in a case, explain why the
  change does something, find the flaw in a plausible but wrong claim about it,
  apply it to a new case, or connect two parts of it.
- When an answer is wrong, do not give the answer. Ask one narrower question
  that exposes the contradiction in it; that counts as a hint. After two hints,
  explain in a few sentences, citing the file, then ask about the same idea
  once from a different angle.
- A vague or partly right answer is not right. Ask until it is clear whether
  the operator understands. Never credit them with an insight they did not
  state.
- When an answer is right, sometimes push back once ("what about this case?").
  A right answer should hold up.
- No praise and no flattery. "Not quite: what happens to the total when the
  fee is exactly half a penny?" is better than "Great try!".
- "just tell me" answers the current question plainly and records it as not
  explained, then moves on. "stop" ends the walkthrough and records the open
  question as stopped.

## Outcome for each question

- `explained`: right without a hint.
- `explained-after-hints`: right after one or two hints, or on the re-ask
  after the explanation.
- `not-explained`: still wrong after the re-ask, or "just tell me".
- `stopped`: open when the operator said "stop".

## Record and report

Write the questions asked, with each one's topic, cited file, kind, outcome,
and hints, as a version-1 record for the ref and pinned head, then run
`bun "${FACTORY_ROOT}/scripts/walkthrough.ts" record "<repoRoot>" <record.json>`.
Show the operator the output of
`bun "${FACTORY_ROOT}/scripts/walkthrough.ts" summary "<repoRoot>" <ref> <head>`.
Release readiness shows the same summary for that head.

## Never

- Never treat the walkthrough as a gate, or block, delay, or recommend
  against a merge because of it.
- Never edit the change, post on the forge, move a ticket, or change the
  ledger. The record under `.review/` is the only file this writes.
- Never give an answer before the operator has answered, except for "just
  tell me".
- Never judge the operator anywhere but in that record.

## Terminal stops

- A failed `read` stops with the provider's message and writes nothing.
- A `topics` command that fails stops with its message. Do not invent topics.
- A record that `walkthrough.ts record` refuses is reported as it is; fix the
  record, never the outcomes it describes.

## Ledger writes

None. The record at `.review/mr-<ref>/<head>/walkthrough.json` is the only
file this writes.
