// Integration smoke for the embed write-path against a REAL local pgvector.
//
// Runs the eval corpus through embedResume() with the deterministic FakeEmbedder
// (no OpenAI key) and asserts the store's idempotent delete-then-insert:
// embedding the whole corpus twice yields identical row counts, never duplicates.
// Fake vectors are NOT semantically meaningful — this checks plumbing, not recall.
//
// Skipped by default (needs the container). Run it with:
//   npm run smoke:embed
// which compiles and executes with RUN_DB_SMOKE=1 against DATABASE_URL
// (defaults to the local container).

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { embedResume } from './embedResume';
import { FakeEmbedder } from './embeddings';
import { storeFromEnv, type PgChunkStore } from './store';
import type { ParsedResumeData } from '../types';

const RUN = !!process.env.RUN_DB_SMOKE;
const ASOF = new Date('2025-01-01T00:00:00Z');

type Fixture = { resumeId: string; parsedData: ParsedResumeData };
let corpus: Fixture[] = [];
let store: PgChunkStore;
const embedder = new FakeEmbedder();

before(async () => {
  if (!RUN) return;
  corpus = JSON.parse(readFileSync(join(process.cwd(), 'eval', 'resumes.json'), 'utf8'));
  store = storeFromEnv();
  // Start from a clean slate for this corpus so the idempotency assertions hold
  // regardless of what other integration files seeded into the shared database.
  for (const { resumeId } of corpus) await store.deleteByResume(resumeId);
});

after(async () => {
  if (store) await store.close();
});

async function embedAll(): Promise<number> {
  let total = 0;
  for (const { resumeId, parsedData } of corpus) {
    const res = await embedResume(resumeId, parsedData, { embedder, store, asOf: ASOF });
    total += res.chunks;
  }
  return total;
}

async function totalRows(): Promise<number> {
  let n = 0;
  for (const { resumeId } of corpus) n += await store.countByResume(resumeId);
  return n;
}

test('embed write-path is idempotent across repeated runs', { skip: !RUN }, async () => {
  const first = await embedAll();
  const rowsAfterFirst = await totalRows();
  const second = await embedAll();
  const rowsAfterSecond = await totalRows();

  console.log(`    chunks/pass: ${first} vs ${second}; rows: ${rowsAfterFirst} vs ${rowsAfterSecond}`);

  assert.ok(first > 0, 'expected some chunks to be written');
  assert.equal(first, second, 'chunk counts differ between passes');
  assert.equal(rowsAfterFirst, rowsAfterSecond, 'row count grew on re-embed — NOT idempotent');
  assert.equal(rowsAfterFirst, first, 'table row count does not match chunks written');
});

test('a single resume has a stable chunk count', { skip: !RUN }, async () => {
  await embedResume('r001', corpus.find((c) => c.resumeId === 'r001')!.parsedData, {
    embedder,
    store,
    asOf: ASOF,
  });
  const n = await store.countByResume('r001');
  console.log(`    r001 chunk count: ${n}`);
  // r001: summary + 2 experience + skills + education = 5
  assert.equal(n, 5);
});
