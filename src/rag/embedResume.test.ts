import { test } from 'node:test';
import assert from 'node:assert/strict';
import { embedResume } from './embedResume';
import { FakeEmbedder } from './embeddings';
import type { ChunkStore, ChunkHit, EmbeddedChunk } from './store';
import type { ParsedResumeData } from '../types';

// In-memory store that records what the orchestrator did.
class MemoryStore implements ChunkStore {
  upserts: { resumeId: string; chunks: EmbeddedChunk[] }[] = [];
  deletes: string[] = [];
  async upsertResumeChunks(resumeId: string, chunks: EmbeddedChunk[]) {
    this.upserts.push({ resumeId, chunks });
  }
  async deleteByResume(resumeId: string) {
    this.deletes.push(resumeId);
  }
  async countByResume() {
    return 0;
  }
  async search(): Promise<ChunkHit[]> {
    return [];
  }
  async close() {}
}

const data: ParsedResumeData = {
  fullName: 'Test Person',
  email: 't@example.com',
  phone: null,
  location: null,
  summary: 'Summary line.',
  totalYearsExperience: 3,
  skills: ['TypeScript'],
  languages: [],
  experience: [
    {
      company: 'Acme',
      role: 'Engineer',
      startDate: '2021-01',
      endDate: null,
      current: true,
      description: 'Did things.',
    },
  ],
  education: [],
  certifications: [],
};

test('embedResume: chunks, embeds, and upserts with one embedding per chunk', async () => {
  const store = new MemoryStore();
  const res = await embedResume('rA', data, {
    embedder: new FakeEmbedder(8),
    store,
    asOf: new Date('2025-01-01T00:00:00Z'),
  });

  // summary + 1 experience + skills = 3 chunks
  assert.equal(res.chunks, 3);
  assert.equal(store.upserts.length, 1);
  const upsert = store.upserts[0];
  assert.equal(upsert.resumeId, 'rA');
  assert.equal(upsert.chunks.length, 3);
  for (const c of upsert.chunks) {
    assert.equal(c.embedding.length, 8);
    assert.equal(c.resumeId, 'rA');
  }
  assert.equal(store.deletes.length, 0);
});

test('embedResume: empty resume deletes chunks instead of embedding', async () => {
  const store = new MemoryStore();
  const empty: ParsedResumeData = {
    ...data,
    summary: null,
    skills: [],
    certifications: [],
    experience: [],
    education: [],
  };
  const res = await embedResume('rB', empty, {
    embedder: new FakeEmbedder(8),
    store,
  });
  assert.equal(res.chunks, 0);
  assert.deepEqual(store.deletes, ['rB']);
  assert.equal(store.upserts.length, 0);
});

test('embedResume: throws if the embedder returns the wrong count', async () => {
  const store = new MemoryStore();
  const brokenEmbedder = {
    async embed() {
      return [[1, 2, 3]]; // only one vector, but this resume has 3 chunks
    },
  };
  await assert.rejects(
    () => embedResume('rC', data, { embedder: brokenEmbedder, store }),
    /returned 1 vectors for 3 chunks/,
  );
  assert.equal(store.upserts.length, 0);
});
