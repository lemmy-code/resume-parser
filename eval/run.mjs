// RAG retrieval eval harness — reports recall@5 over the synthetic corpus.
//
// Depends on POST /search (Step 6). Until that endpoint exists this script is
// EXPECTED TO FAIL at the connection step — that red state is correct, not a bug.
//
// Usage:
//   SEARCH_URL=http://localhost:3000/search node eval/run.mjs
//   SEARCH_URL=<lambda-function-url>/search API_KEY=... node eval/run.mjs
//
// Contract expected from /search:
//   POST { query: string, topK: number }
//   -> { results: [{ resumeId: string, score: number }, ...] }  (ranked, best first)

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const queries = JSON.parse(readFileSync(join(here, "queries.json"), "utf8"));

const SEARCH_URL = process.env.SEARCH_URL ?? "http://localhost:3000/search";
const API_KEY = process.env.API_KEY;
const K = 5;

async function search(query) {
  const res = await fetch(SEARCH_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(API_KEY ? { "x-api-key": API_KEY } : {}),
    },
    body: JSON.stringify({ query, topK: K }),
  });
  if (!res.ok) throw new Error(`search returned HTTP ${res.status}`);
  const body = await res.json();
  return (body.results ?? []).map((r) => r.resumeId);
}

function recallAtK(expected, returnedTopK) {
  if (expected.length === 0) return null; // negative query — scored separately
  const hits = expected.filter((id) => returnedTopK.includes(id)).length;
  return hits / expected.length;
}

const rows = [];
let recallSum = 0;
let scored = 0;
let negativesClean = 0;
let negativesTotal = 0;

for (const q of queries) {
  let returned;
  try {
    returned = await search(q.query);
  } catch (err) {
    console.error(`\n✗ Could not reach ${SEARCH_URL}: ${err.message}`);
    console.error(
      "  This is expected until Step 6 (POST /search) is implemented.\n",
    );
    process.exit(2);
  }
  const topK = returned.slice(0, K);

  if (q.expected.length === 0) {
    negativesTotal++;
    const leaked = topK.filter((id) => id === "r008"); // near-miss distractor
    const clean = leaked.length === 0;
    if (clean) negativesClean++;
    rows.push({ id: q.id, type: q.type, metric: clean ? "clean" : "LEAK", topK: topK.join(", ") });
    continue;
  }

  const r = recallAtK(q.expected, topK);
  recallSum += r;
  scored++;
  rows.push({
    id: q.id,
    type: q.type,
    metric: `recall@${K}=${r.toFixed(2)}`,
    topK: topK.join(", "),
  });
}

console.log("\nRAG retrieval eval — recall@5\n");
for (const row of rows) {
  console.log(
    `  ${row.id}  ${row.metric.padEnd(16)} [${row.type}]  ->  ${row.topK}`,
  );
}
const mean = scored ? recallSum / scored : 0;
console.log(
  `\n  mean recall@${K} over ${scored} scored queries: ${mean.toFixed(3)}`,
);
if (negativesTotal) {
  console.log(
    `  negative queries handled cleanly: ${negativesClean}/${negativesTotal}`,
  );
}
console.log("");
