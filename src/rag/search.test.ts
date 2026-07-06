import { test } from 'node:test';
import assert from 'node:assert/strict';
import { searchResumesSemantic } from './search';
import { FakeEmbedder } from './embeddings';
import type { ChunkStore, ChunkHit, EmbeddedChunk } from './store';

// Store double that returns canned hits, so we test the grouping/ranking logic
// in isolation from pgvector.
class StubStore implements ChunkStore {
  constructor(private hits: ChunkHit[]) {}
  lastLimit = 0;
  async search(_e: number[], limit: number): Promise<ChunkHit[]> {
    this.lastLimit = limit;
    return this.hits;
  }
  async upsertResumeChunks(_r: string, _c: EmbeddedChunk[]) {}
  async deleteByResume() {}
  async countByResume() {
    return 0;
  }
  async close() {}
}

function hit(resumeId: string, score: number, chunkType = 'experience'): ChunkHit {
  return { resumeId, chunkType: chunkType as ChunkHit['chunkType'], content: `${resumeId}:${chunkType}`, metadata: {}, score };
}

const deps = (hits: ChunkHit[]) => ({ embedder: new FakeEmbedder(8), store: new StubStore(hits) });

test('groups chunks by resume and ranks by best chunk score', async () => {
  const hits = [
    hit('rA', 0.6),
    hit('rB', 0.9),
    hit('rA', 0.8), // rA's best is 0.8
    hit('rC', 0.7),
  ];
  const res = await searchResumesSemantic('q', { topK: 3 }, deps(hits));
  assert.deepEqual(res.map((r) => r.resumeId), ['rB', 'rA', 'rC']);
  assert.equal(res[0].score, 0.9);
  const rA = res.find((r) => r.resumeId === 'rA')!;
  assert.equal(rA.score, 0.8); // best of 0.6 / 0.8
  assert.equal(rA.chunks.length, 2); // both rA chunks attached
});

test('respects topK after grouping', async () => {
  const hits = [hit('rA', 0.9), hit('rB', 0.8), hit('rC', 0.7), hit('rD', 0.6)];
  const res = await searchResumesSemantic('q', { topK: 2 }, deps(hits));
  assert.equal(res.length, 2);
  assert.deepEqual(res.map((r) => r.resumeId), ['rA', 'rB']);
});

test('over-fetches chunks (fanout) to surface enough distinct candidates', async () => {
  const store = new StubStore([]);
  await searchResumesSemantic('q', { topK: 5 }, { embedder: new FakeEmbedder(8), store });
  assert.ok(store.lastLimit >= 20, `expected fanout >= 20, got ${store.lastLimit}`);
});

test('empty result set yields no candidates', async () => {
  const res = await searchResumesSemantic('q', { topK: 5 }, deps([]));
  assert.deepEqual(res, []);
});
