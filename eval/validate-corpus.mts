// Validates the synthetic eval corpus against the REAL extraction schema.
// Single source of truth: imports parsedResumeSchema straight from src/, so if the
// pipeline's schema changes, this check breaks until the fixtures are updated.
//
// Run (Node 23+ strips the TS types natively):
//   node eval/validate-corpus.ts

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { parsedResumeSchema } from "../src/schemas/resume.schema.ts";

const here = dirname(fileURLToPath(import.meta.url));

type Fixture = { resumeId: string; parsedData: unknown };
const corpus: Fixture[] = JSON.parse(
  readFileSync(join(here, "resumes.json"), "utf8"),
);

let failures = 0;
const seenIds = new Set<string>();

for (const { resumeId, parsedData } of corpus) {
  if (!resumeId) {
    console.error("✗ fixture with missing resumeId");
    failures++;
    continue;
  }
  if (seenIds.has(resumeId)) {
    console.error(`✗ ${resumeId}: duplicate resumeId`);
    failures++;
  }
  seenIds.add(resumeId);

  const result = parsedResumeSchema.safeParse(parsedData);
  if (!result.success) {
    failures++;
    console.error(`✗ ${resumeId}: schema validation failed`);
    for (const issue of result.error.issues) {
      console.error(`    ${issue.path.join(".")}: ${issue.message}`);
    }
  } else {
    console.log(`✓ ${resumeId}  (${result.data.fullName})`);
  }
}

// Cross-check: every expected resumeId in queries.json must exist in the corpus.
const queries: { id: string; expected: string[] }[] = JSON.parse(
  readFileSync(join(here, "queries.json"), "utf8"),
);
for (const q of queries) {
  for (const id of q.expected) {
    if (!seenIds.has(id)) {
      failures++;
      console.error(`✗ query ${q.id} expects unknown resumeId "${id}"`);
    }
  }
}

console.log(
  `\n${corpus.length} resumes, ${queries.length} queries — ${failures} problem(s).`,
);
process.exit(failures === 0 ? 0 : 1);
