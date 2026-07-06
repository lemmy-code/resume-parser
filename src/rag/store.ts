// Persistence for embedded resume chunks (pgvector).
//
// The ChunkStore interface isolates the driver: local dev and tests use the
// `pg` implementation against the container; the deployed Lambda can swap in an
// RDS Data API implementation behind the same interface without touching the
// embed/backfill code.

import { Pool } from 'pg';
import type { PoolClient } from 'pg';
import type { ResumeChunk } from './chunk';

export interface EmbeddedChunk extends ResumeChunk {
  embedding: number[];
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
