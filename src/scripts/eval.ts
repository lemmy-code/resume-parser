// Local recall@5 harness — runs the eval queries straight through
// searchResumesSemantic (no HTTP, no deployed endpoint) and prints the table.
//
// Prereqs: `npm run seed:eval` first (real embeddings in the store), plus
// OPENAI_API_KEY and a reachable DATABASE_URL. Run (compiled): npm run eval

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { searchResumesSemantic } from '../rag/search';
import { embedderFromEnv } from '../rag/embeddings';
import { storeFromEnv } from '../rag/store';

interface Query {
  id: string;
  type: string;
  query: string;
  expected: string[];
}

const K = 5;
const NEAR_MISS = 'r008'; // the negative-query distractor to watch for

async function main(): Promise<void> {
  const queries: Query[] = JSON.parse(
    readFileSync(join(process.cwd(), 'eval', 'queries.json'), 'utf8'),
  );
  const embedder = embedderFromEnv();
  const store = storeFromEnv();

  const rows: string[] = [];
  let recallSum = 0;
  let scored = 0;
  let negClean = 0;
  let negTotal = 0;

  try {
    for (const q of queries) {
      const hits = await searchResumesSemantic(q.query, { topK: K }, { embedder, store });
      const ids = hits.map((h) => h.resumeId);

      if (q.expected.length === 0) {
        negTotal++;
        const clean = !ids.slice(0, K).includes(NEAR_MISS);
        if (clean) negClean++;
        rows.push(`  ${q.id}  ${clean ? 'clean' : 'LEAK '}         [${q.type}]  ->  ${ids.join(', ')}`);
        continue;
      }

      const recall = q.expected.filter((id) => ids.slice(0, K).includes(id)).length / q.expected.length;
      recallSum += recall;
      scored++;
      rows.push(`  ${q.id}  recall@${K}=${recall.toFixed(2)}  [${q.type}]  ->  ${ids.join(', ')}`);
    }
  } finally {
    await store.close();
  }

  console.log('\nRAG retrieval eval — recall@5\n');
  for (const r of rows) console.log(r);
  console.log(`\n  mean recall@${K} over ${scored} scored queries: ${(scored ? recallSum / scored : 0).toFixed(3)}`);
  if (negTotal) console.log(`  negative queries handled cleanly: ${negClean}/${negTotal}`);
  console.log('');
}

main().catch((err) => {
  console.error('Eval failed:', err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
