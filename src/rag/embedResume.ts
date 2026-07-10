// Orchestrates embedding for one resume — the single code path shared by the
// DynamoDB-Streams handler and the backfill script.
//
//   validated JSON -> chunk -> ONE batched embeddings call -> idempotent upsert
//
// A resume with no embeddable content deletes any existing chunks and returns,
// so this is safe to call for every INSERT/MODIFY without special-casing.

import type { ParsedResumeData } from '../types';
import { chunkResume } from './chunk';
import type { Embedder } from './embeddings';
import type { ChunkStore, EmbeddedChunk } from './store';

export interface EmbedDeps {
  embedder: Embedder;
  store: ChunkStore;
  asOf?: Date;
}

export interface EmbedResult {
  resumeId: string;
  chunks: number;
}

export async function embedResume(
  resumeId: string,
  data: ParsedResumeData,
  deps: EmbedDeps,
): Promise<EmbedResult> {
  const chunks = chunkResume(resumeId, data, { asOf: deps.asOf });

  if (chunks.length === 0) {
    await deps.store.deleteByResume(resumeId);
    return { resumeId, chunks: 0 };
  }

  // One embeddings call for all chunks of this resume.
  const vectors = await deps.embedder.embed(chunks.map((c) => c.content));
  if (vectors.length !== chunks.length) {
    throw new Error(
      `embedder returned ${vectors.length} vectors for ${chunks.length} chunks (resume ${resumeId})`,
    );
  }

  const embedded: EmbeddedChunk[] = chunks.map((c, i) => ({
    ...c,
    embedding: vectors[i],
  }));

  await deps.store.upsertResumeChunks(resumeId, embedded);
  return { resumeId, chunks: embedded.length };
}
