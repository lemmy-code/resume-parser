// Persistence for embedded resume chunks (pgvector).
//
// The ChunkStore interface isolates the driver: local dev and tests use the
// `pg` implementation against the container; the deployed Lambda can swap in an
// RDS Data API implementation behind the same interface without touching the
// embed/backfill code.

import { Pool } from 'pg';
import type { PoolClient } from 'pg';
import type { ResumeChunk, ChunkType } from './chunk';

export interface EmbeddedChunk extends ResumeChunk {
  embedding: number[];
}

/** A single chunk that matched a search, with its cosine similarity (1 = identical). */
export interface ChunkHit {
  resumeId: string;
  chunkType: ChunkType;
  content: string;
  metadata: Record<string, unknown>;
  score: number;
}

export interface SearchFilter {
  /** Restrict to one chunk type (e.g. only 'skills'). */
  chunkType?: ChunkType;
  /** Keep only experience chunks whose derived role duration is at least this many years. */
  minYears?: number;
}

export interface ChunkStore {
  /**
   * Replace all chunks for a resume in a single transaction (idempotent):
   * re-embedding the same resume never leaves duplicates or stale chunks.
   */
  upsertResumeChunks(resumeId: string, chunks: EmbeddedChunk[]): Promise<void>;
  /** Remove all chunks for a resume (used when a resume has no embeddable content). */
  deleteByResume(resumeId: string): Promise<void>;
  /** Number of chunks stored for a resume — for smoke checks / assertions. */
  countByResume(resumeId: string): Promise<number>;
  /** Vector search: nearest chunks to the query embedding, best-first, with optional filters. */
  search(queryEmbedding: number[], limit: number, filter?: SearchFilter): Promise<ChunkHit[]>;
  close(): Promise<void>;
}

/** pgvector serializes a vector literal as "[a,b,c]". */
function toVectorLiteral(embedding: number[]): string {
  return `[${embedding.join(',')}]`;
}

export class PgChunkStore implements ChunkStore {
  private readonly pool: Pool;

  constructor(pool: Pool) {
    this.pool = pool;
  }

  static fromConnectionString(connectionString: string): PgChunkStore {
    return new PgChunkStore(new Pool({ connectionString }));
  }

  async upsertResumeChunks(resumeId: string, chunks: EmbeddedChunk[]): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('DELETE FROM resume_chunks WHERE resume_id = $1', [resumeId]);
      if (chunks.length > 0) {
        await this.insertChunks(client, chunks);
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  }

  private async insertChunks(client: PoolClient, chunks: EmbeddedChunk[]): Promise<void> {
    const cols = 5; // resume_id, chunk_type, content, metadata, embedding
    const values: unknown[] = [];
    const rows: string[] = [];
    chunks.forEach((c, i) => {
      const base = i * cols;
      rows.push(
        `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}::jsonb, $${base + 5}::vector)`,
      );
      values.push(
        c.resumeId,
        c.chunkType,
        c.content,
        JSON.stringify(c.metadata ?? {}),
        toVectorLiteral(c.embedding),
      );
    });
    await client.query(
      `INSERT INTO resume_chunks (resume_id, chunk_type, content, metadata, embedding)
       VALUES ${rows.join(', ')}`,
      values,
    );
  }

  async search(
    queryEmbedding: number[],
    limit: number,
    filter: SearchFilter = {},
  ): Promise<ChunkHit[]> {
    const conditions: string[] = [];
    const params: unknown[] = [toVectorLiteral(queryEmbedding)];
    if (filter.chunkType) {
      params.push(filter.chunkType);
      conditions.push(`chunk_type = $${params.length}`);
    }
    if (filter.minYears != null) {
      params.push(String(filter.minYears));
      // Non-experience chunks have no 'years' → NULL → excluded, which is the intent.
      conditions.push(`(metadata->>'years')::numeric >= $${params.length}`);
    }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    // limit is inlined (validated integer) — LIMIT rejects a text bind param.
    const safeLimit = Math.max(1, Math.floor(limit));

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      // pgvector 0.8: iterative scans keep fetching from the HNSW index until the
      // LIMIT is satisfied, so a selective WHERE filter does not starve results.
      await client.query("SET LOCAL hnsw.iterative_scan = 'strict_order'");
      const res = await client.query(
        `SELECT resume_id, chunk_type, content, metadata,
                1 - (embedding <=> $1::vector) AS score
           FROM resume_chunks
           ${where}
          ORDER BY embedding <=> $1::vector
          LIMIT ${safeLimit}`,
        params,
      );
      await client.query('COMMIT');
      return res.rows.map((r) => ({
        resumeId: r.resume_id,
        chunkType: r.chunk_type as ChunkType,
        content: r.content,
        metadata: r.metadata ?? {},
        score: Number(r.score),
      }));
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  }

  async deleteByResume(resumeId: string): Promise<void> {
    await this.pool.query('DELETE FROM resume_chunks WHERE resume_id = $1', [resumeId]);
  }

  async countByResume(resumeId: string): Promise<number> {
    const res = await this.pool.query<{ count: string }>(
      'SELECT count(*)::int AS count FROM resume_chunks WHERE resume_id = $1',
      [resumeId],
    );
    return res.rows[0]?.count ? Number(res.rows[0].count) : 0;
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}

const LOCAL_DEFAULT = 'postgres://resume:resume@127.0.0.1:5432/resume_rag';

export function storeFromEnv(): PgChunkStore {
  return PgChunkStore.fromConnectionString(process.env.DATABASE_URL || LOCAL_DEFAULT);
}
