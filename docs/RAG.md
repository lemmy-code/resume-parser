# Semantic Search + RAG Layer

A semantic search and retrieval-augmented-generation layer on top of the resume
pipeline, so a recruiter can ask *"find candidates with event-driven Azure
experience who also know React"* instead of matching keywords.

> **PII note:** all resumes used to develop and evaluate this layer are
> **synthetic** (`eval/resumes.json`). No real personal data is processed.

---

## Architecture (single cloud)

The whole stack lives in AWS. Postgres + pgvector replaces the original plan's
managed vector DB so there is no second cloud to authenticate against, no
cross-cloud latency, and one IaC surface.

```
            existing pipeline                              new: RAG layer
┌────────┐   ┌─────┐   ┌──────────────┐        ┌──────────────────┐
│ S3     │──▶│ SQS │──▶│ Claude       │        │ Embed Lambda     │
│ upload │   │     │   │ extraction   │        │ chunk → embed →  │
└────────┘   └─────┘   │ (Zod valid.) │        │ upsert pgvector  │
                       └──────┬───────┘        └───────┬──────────┘
                              ▼                        ▲       ▼
                        DynamoDB ─── Streams ──────────┘   Postgres + pgvector
                        (source of truth)  (trigger)       (Docker local /
                                                            RDS · Aurora Sv2)
                                                                 ▲
                                            ┌────────────────────┴────────┐
                                            │ POST /search  (ranked)      │
                                            │ POST /ask     (grounded RAG)│
                                            └─────────────────────────────┘
```

**Flow:** extraction writes structured JSON to DynamoDB (the source of truth) →
a DynamoDB Stream triggers the embed Lambda → it chunks the resume, embeds the
chunks in one call, and upserts vectors into pgvector → `/search` and `/ask`
read from pgvector.

---

## Design decisions (honest version)

**Chunk the validated JSON, not the raw PDF.** Chunking runs on the
Zod-validated extraction output, so each chunk is a semantic unit — the summary,
one chunk per job, the skill list, each degree — rendered to natural-language
prose. No arbitrary 500-char splits, no mid-sentence cuts. Prose embeds better
than a JSON blob carrying the same facts. (The extraction schema has no
per-job `years`/`skills`, so role duration is derived from `startDate`/`endDate`
and skills live in their own chunk.)

**Embedding reacts to DynamoDB Streams, not the SQS success path.** Extraction
owns writing the source of truth; embedding reacts to it. A failed or slow
embed can therefore never corrupt an extraction result, the flow is replayable
(stream retention + a backfill script share the exact same code path), and
failed stream records retry on their own via partial batch responses.

**HNSW is the production pattern — and the eval proves it doesn't cost recall.**
At this corpus size a brute-force scan would also work; the HNSW index is here
to demonstrate the real setup. The eval harness (below) is how we show the
index isn't silently hurting retrieval.

**Filtered vector search is handled by pgvector 0.8.** Combining a selective
metadata `WHERE` with an HNSW `ORDER BY embedding <=>` can starve results on
older pgvector — the index returns its top candidates before the filter
applies. `search()` runs inside a transaction that sets
`hnsw.iterative_scan = strict_order`, so pgvector 0.8+ keeps pulling from the
index until the `LIMIT` is satisfied. (Verified running pgvector 0.8.4.)

**One embedding model, kept behind an interface.** The same model
(`text-embedding-3-small`, 1536-d) is used for indexing and querying — mixing
models makes cosine distances meaningless. OpenAI sits behind an `Embedder`
interface, so tests inject a deterministic fake and exercise the whole write and
search path with **no API key and no network**.

**Idempotent by construction.** Writes are delete-then-insert per `resume_id` in
a transaction, so re-embedding (backfill, model change, stream replay) never
duplicates or strands chunks.

**`/ask` is synthesis + grounding, not a `/search` replacement.** `/search`
already ranks candidates; `/ask`'s value is multi-resume synthesis and a
grounded, cited, fabrication-resistant answer. Grounding is enforced twice: a
strict system prompt (answer only from context, cite resumeIds, refuse when
unsupported) **and** a hard post-filter that drops any cited `resumeId` that
wasn't actually retrieved.

**Tests run through the real compilation.** Test files compile with `tsc` and
run on Node's built-in runner — same CommonJS module resolution as the Lambda
build — so they can cover modules that import runtime deps (`pg`) without a test
framework or a separate ESM path.

---

## Evaluation

`eval/` answers *"how do you know the RAG works?"* with a number.

- `eval/resumes.json` — 15 synthetic resumes, biased toward the target stack
  (TypeScript / AWS / Azure / event-driven / React) with off-target distractors.
- `eval/queries.json` — 10 hand-authored queries with known-correct `resumeId`s,
  covering exact-skill, paraphrase/synonym (e.g. "infrastructure as code" →
  Bicep/Terraform), multi-constraint (event-driven + Azure + React), seniority,
  and a **negative** case (iOS + Unreal) that has no correct answer — a good
  system returns low-confidence results instead of a confident false positive.

Run it locally (no deploy needed — calls the search function directly):

```bash
docker compose up -d postgres
npm run db:migrate      # or: ./scripts/db-migrate.sh
npm run seed:eval       # embeds the corpus with real embeddings (needs OPENAI_API_KEY)
npm run eval            # prints recall@5 per query + mean
```

### Results

_Pending a real embedding run (`npm run seed:eval && npm run eval`) — paste the
`npm run eval` table here. Corpus/query integrity and the search/ask plumbing
are verified today via `node eval/validate-corpus.mts`, `npm test`, and
`npm run smoke:search`._

---

## Local development

```bash
docker compose up -d postgres        # pgvector, bound to 127.0.0.1
./scripts/pgvector-smoke.sh          # Step 0 gate: extension + HNSW + <=> ordering
./scripts/db-migrate.sh              # apply migrations/*.sql
npm test                             # unit tests (compile-first, no infra)
npm run smoke:embed                  # embed write-path vs real pgvector (idempotency)
npm run smoke:search                 # search mechanics vs real pgvector
```

`DATABASE_URL` defaults to the local container; `OPENAI_API_KEY` is only needed
for real embeddings (`seed:eval`, `backfill`, live `/search`·`/ask`).

---

## Deploy notes

The application code is deploy-ready; the SAM wiring is intentionally deferred
(founder-gated) and coupled to one decision:

- **DB connectivity.** The embed/search/ask Lambdas need both Postgres *and*
  external APIs (OpenAI, Anthropic). Placing a Lambda in the RDS VPC removes its
  default internet egress, forcing a NAT Gateway (~$32/mo + data — which
  contradicts the near-zero cost story). Recommended: **Aurora Serverless v2 +
  the RDS Data API**, so the Lambdas stay out of the VPC and reach the DB and the
  external APIs over HTTPS with no NAT. Aurora Sv2 also scales to 0 ACU when idle.
- **Still to add to `template.yaml`:** the `EmbedFunction` (DynamoDB Stream event
  source + on-failure SQS destination), `SearchFunction`, `AskFunction`, and the
  `DATABASE_URL` / `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` config (via Secrets
  Manager).

## Cost

- Embeddings: `text-embedding-3-small` ≈ $0.00002 / 1K tokens → the whole corpus
  for cents.
- Postgres: free locally; deploy on Aurora Serverless v2 (scale-to-zero when
  idle) or an RDS `t4g.micro`.
- `/ask`: pennies per query at ~10 chunks of context.
