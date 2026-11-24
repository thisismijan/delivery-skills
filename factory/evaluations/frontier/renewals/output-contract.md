# Output contract

Answer with only this JSON object: no prose and no code fences.

{
  "approach": {
    "verdict": "sound | gaps | rethink",
    "gaps": [{ "case": "the concrete input or situation", "evidence": "path:line, search result, or spec line" }],
    "rethink": { "problem": "why adding cases cannot close the gaps", "alternative": "the approach that removes the problem" },
    "reasoning": "1-3 sentences"
  },
  "adjudication": {
    "decisions": [{ "id": "C1", "verdict": "confirmed | rejected", "evidence": "path:line" }]
  }
}

`rethink` is null unless the verdict is `rethink`. Give one decision per
candidate. Add no other keys.
