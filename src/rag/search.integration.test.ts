// Live search mechanics against real pgvector — ordering, grouping, filters.
//
// Uses FakeEmbedder (no OpenAI key). Determinism trick: identical text produces
// an identical fake vector, so querying with the EXACT content of a known chunk
// gives it cosine distance 0 and forces it to rank first — letting us assert
// real ordering without a semantic model.
//
// Skipped unless RUN_DB_SMOKE=1 (see npm run smoke:embed / smoke:search).

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { embedResume } from './embedResume';
import { searchResumesSemantic } from './search';
import { chunkResume } from './chunk';
import { FakeEmbedder } from './embeddings';
import { storeFromEnv, type PgChunkStore } from './store';
import type { ParsedResumeData } from '../types';

const RUN = !!process.env.RUN_DB_SMOKE;
const ASOF = new Date('2025-01-01T00:00:00Z');
const embedder = new FakeEmbedder();

type Fixture = { resumeId: string; parsedData: ParsedResumeData };
let corpus: Fixture[] = [];
let store: PgChunkStore;

before(async () => {
  if (!RUN) return;
  corpus = JSON.parse(readFileSync(join(process.cwd(), 'eval', 'resumes.json'), 'utf8'));
  store = storeFromEnv();
  // Clean this corpus first so a re-run (or another integration file) never
  // leaves stale/duplicate chunks that would skew ordering assertions.
  for (const { resumeId } of corpus) await store.deleteByResume(resumeId);
  for (const { resumeId, parsedData } of corpus) {
    await embedResume(resumeId, parsedData, { embedder, store, asOf: ASOF });
  }
});

after(async () => {
  if (store) await store.close();
});

test('exact-content query ranks its own resume first', { skip: !RUN }, async () => {
  const r006 = corpus.find((c) => c.resumeId === 'r006')!;
  const skillsChunk = chunkResume('r006', r006.parsedData, { asOf: ASOF }).find(
    (c) => c.chunkType === 'skills',
  )!;

  const results = await searchResumesSemantic(skillsChunk.content, { topK: 5 }, { embedder, store });

  assert.ok(results.length > 0);
  assert.equal(results[0].resumeId, 'r006');
  assert.ok(results[0].score > 0.99, `expected ~1.0 for identical text, got ${results[0].score}`);
  // explainability: the matching chunk is attached
  assert.ok(results[0].chunks.some((c) => c.chunkType === 'skills'));
});

test('chunkType filter returns only that chunk type', { skip: !RUN }, async () => {
  const r003 = corpus.find((c) => c.resumeId === 'r003')!;
  const summary = chunkResume('r003', r003.parsedData, { asOf: ASOF }).find(
    (c) => c.chunkType === 'summary',
  )!;

  const results = await searchResumesSemantic(
    summary.content,
    { topK: 10, filter: { chunkType: 'skills' } },
    { embedder, store },
  );

  for (const r of results) {
    for (const c of r.chunks) {
      assert.equal(c.chunkType, 'skills', 'filter leaked a non-skills chunk');
    }
  }
});

test('results are grouped by resume (no duplicate resume rows)', { skip: !RUN }, async () => {
  const r001 = corpus.find((c) => c.resumeId === 'r001')!;
  const summary = chunkResume('r001', r001.parsedData, { asOf: ASOF }).find(
    (c) => c.chunkType === 'summary',
  )!;
  const results = await searchResumesSemantic(summary.content, { topK: 10 }, { embedder, store });
  const ids = results.map((r) => r.resumeId);
  assert.equal(new Set(ids).size, ids.length, 'a resume appeared more than once');
});
