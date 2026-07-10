# RAG retrieval eval

A small, hand-authored evaluation harness for the semantic-search layer. It answers
the interview question *"how do you know your RAG actually works?"* with a number.

> **PII note:** every resume here is **synthetic**. No real personal data is used
> anywhere in this project.

## Files

| File | What it is |
|---|---|
| `resumes.json` | 15 synthetic resumes (`{ resumeId, parsedData }`), each conforming to the pipeline's real `parsedResumeSchema`. This is the ground-truth corpus. |
| `queries.json` | 10 hand-authored queries, each with the `expected` resume IDs and a note on *why* those are the correct answers. |
| `validate-corpus.mts` | Validates every fixture against `src/schemas/resume.schema.ts` (single source of truth) and checks that every `expected` ID exists. |
| `run.mjs` | Runs each query through `POST /search` and reports **recall@5**. |

## Corpus design

The 15 candidates are laid out so each query has a **tight, known** ground-truth set —
no ambiguity about what "correct" means. Coverage is deliberately biased toward the
target stack (TypeScript, AWS, Azure, event-driven, React) so the demo queries are
realistic, with off-target profiles (data engineer, Unity game dev, product designer)
acting as distractors.

Query types exercised:

- **exact skill / tech** (`q01` Kubernetes, `q05` Spring Boot, `q09` AppSec) — one match each
- **paraphrase / synonym** (`q02` "infrastructure as code" → Bicep/Terraform, `q07` "vector databases" → pgvector/RAG) — the resumes never use the query's words
- **multi-constraint** (`q03` event-driven + Azure + React, `q04` React + AWS + event-driven) — the trap is candidates who satisfy 2 of 3
- **seniority** (`q06` staff/distributed, `q10` junior front-end) — tests that the ranking reads seniority signal, not just the domain noun
- **negative** (`q08` iOS + Unreal) — no correct answer exists; a good system returns low-confidence results instead of a confident false positive. `r008` (Unity mobile games) is the near-miss distractor the harness watches for.

## Running

```bash
# 1. corpus integrity (no services needed)
node eval/validate-corpus.mts

# 2. retrieval quality (needs POST /search from Step 6)
SEARCH_URL=http://localhost:3000/search node eval/run.mjs
```

`run.mjs` expects `/search` to return `{ results: [{ resumeId, score }, ...] }` ranked
best-first. Until Step 6 exists it exits non-zero with a "wire /search first" message —
that red state is expected.

## Results

_(populated once `/search` is live — paste the `run.mjs` output table here)_
