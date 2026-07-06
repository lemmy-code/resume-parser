// Semantic search: natural-language query -> ranked candidates.
//
//   embed query (SAME model as indexing) -> vector search over chunks
//   -> group hits by resume -> rank resumes by their best-matching chunk
//
// Grouping by resume with the matched chunks attached gives explainability:
// the response shows *why* a candidate matched, not just that they did.

import type { Embedder } from './embeddings';
import type { ChunkStore, SearchFilter } from './store';

export interface MatchedChunk {
  chunkType: string;
  content: string;
  score: number;
}

export interface ResumeSearchHit {
  resumeId: string;
  score: number; // the best chunk score for this resume
  chunks: MatchedChunk[];
}

export interface SearchOptions {
  topK?: number;
  filter?: SearchFilter;
}

export interface SearchDeps {
  embedder: Embedder;
  store: ChunkStore;
}

const DEFAULT_TOP_K = 5;

export async function searchResumesSemantic(
  query: string,
  opts: SearchOptions,
  deps: SearchDeps,
): Promise<ResumeSearchHit[]> {
  const topK = Math.max(1, opts.topK ?? DEFAULT_TOP_K);

  const [embedding] = await deps.embedder.embed([query]);
  if (!embedding) return [];

  // Over-fetch chunks so we can surface enough distinct candidates after grouping:
  // one resume can occupy several of the nearest chunks.
  const fanout = Math.max(topK * 5, 20);
  const hits = await deps.store.search(embedding, fanout, opts.filter);

  const byResume = new Map<string, ResumeSearchHit>();
  for (const h of hits) {
    let entry = byResume.get(h.resumeId);
    if (!entry) {
      entry = { resumeId: h.resumeId, score: h.score, chunks: [] };
      byResume.set(h.resumeId, entry);
    }
    entry.chunks.push({ chunkType: h.chunkType, content: h.content, score: h.score });
    if (h.score > entry.score) entry.score = h.score;
  }

  return [...byResume.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}
