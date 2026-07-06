// Seed the vector store with the eval corpus using REAL embeddings.
//
// Needed before `npm run eval` can produce meaningful recall numbers (the fake
// embedder isn't semantic). Requires OPENAI_API_KEY and a reachable DATABASE_URL
// (defaults to the local container). Idempotent — safe to re-run.
//
// Run (compiled): npm run seed:eval

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { embedResume } from '../rag/embedResume';
import { embedderFromEnv, FakeEmbedder, type Embedder } from '../rag/embeddings';
import { storeFromEnv } from '../rag/store';
import type { ParsedResumeData } from '../types';

const ASOF = new Date('2025-01-01T00:00:00Z');

function makeEmbedder(): Embedder {
  return process.env.EMBEDDER === 'fake' ? new FakeEmbedder() : embedderFromEnv();
}

async function main(): Promise<void> {
  const corpus: { resumeId: string; parsedData: ParsedResumeData }[] = JSON.parse(
    readFileSync(join(process.cwd(), 'eval', 'resumes.json'), 'utf8'),
  );
  const embedder = makeEmbedder();
  const store = storeFromEnv();
  let chunks = 0;
  try {
    for (const { resumeId, parsedData } of corpus) {
      const res = await embedResume(resumeId, parsedData, { embedder, store, asOf: ASOF });
      chunks += res.chunks;
      console.log(`  ✓ ${resumeId} (${res.chunks} chunks)`);
    }
  } finally {
    await store.close();
  }
  console.log(`\nSeeded ${corpus.length} resumes, ${chunks} chunks.`);
}

main().catch((err) => {
  console.error('Seed failed:', err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
