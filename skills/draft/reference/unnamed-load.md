# Answering an ambiguous load

Read this at step 0 when the skill was loaded without being named, for example a host matching this skill on a plain question.

For an ambiguous request, ask exactly one question (a full run, or only an answer?). Write nothing tracked, post nothing, and dispatch no worker until it is answered.

- A clear yes continues at step 1.
- Anything else (a question, silence, or a reply that is not a clear yes): the skill answers the original question and ends. Ask no second clarifying question. Post nothing and write nothing tracked.

When the answer needs the ticket text, it may use step 1's fetch command (`work-item-provider.ts read`) and the fetched result. It may save the result to `<reviewDir>/work-item.json` only when `<reviewDir>` is already ignored by the repository; otherwise it uses the result without saving it. It never edits `.gitignore`, never reads a provider file, never calls a remote provider directly, and never posts a note.
