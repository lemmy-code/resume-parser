-- 0001 — RAG semantic-search layer: resume_chunks table.
-- Idempotent: safe to re-run against an existing database.
--
-- One row per semantic chunk of a resume (summary / one per experience / skills / education).
-- DynamoDB stays the source of truth; this table holds only what search needs, keyed
-- back to it by resume_id.

create extension if not exists vector;

create table if not exists resume_chunks (
  id          uuid primary key default gen_random_uuid(),
  resume_id   text not null,                    -- DynamoDB key; joins back to the source of truth
  chunk_type  text not null                     -- which semantic unit this chunk is
                check (chunk_type in ('summary', 'experience', 'skills', 'education')),
  content     text not null,                    -- rendered natural-language text that gets embedded
  metadata    jsonb not null default '{}',      -- structured fields for filtering: { company, role, years, skills: [...] }
  embedding   vector(1536) not null,            -- OpenAI text-embedding-3-small
  created_at  timestamptz not null default now()
);

-- Vector ANN index (cosine). HNSW: high recall out of the box, no training step,
-- tolerates inserts. pgvector 0.8+ gives iterative index scans so a metadata filter
-- in the WHERE clause doesn't starve the candidate set (see Step 5).
create index if not exists resume_chunks_embedding_hnsw
  on resume_chunks using hnsw (embedding vector_cosine_ops);

-- Lookup / delete-by-resume for the idempotent re-embed path (Step 4) and for
-- grouping search hits back to a candidate (Step 5).
create index if not exists resume_chunks_resume_id_idx
  on resume_chunks (resume_id);

-- Full-text column + GIN index, for hybrid (vector + keyword) search in the stretch step.
alter table resume_chunks
  add column if not exists fts tsvector
  generated always as (to_tsvector('english', content)) stored;

create index if not exists resume_chunks_fts_gin
  on resume_chunks using gin (fts);
