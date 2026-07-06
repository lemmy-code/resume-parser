// /ask — grounded, cited RAG answer over the resume corpus.
//
//   embed query -> retrieve chunks (same primitive as /search) -> build a
//   cited context block -> ask Claude to answer ONLY from that context and cite
//   resumeIds -> Zod-validate the shape -> drop any cited id not in the context.
//
// The generation half reuses the project's signature move: structured output
// validated with Zod. Two independent grounding guards keep it honest — the
// strict system prompt, and a hard filter that discards candidates the model
// invented (any resumeId not actually retrieved).

import { z } from 'zod';
import type { Embedder } from './embeddings';
import type { ChunkStore } from './store';
import type { AnswerGenerator } from './generator';

export const askResponseSchema = z.object({
  answer: z.string(),
  candidates: z.array(
    z.object({
      resumeId: z.string(),
      reason: z.string(),
    }),
  ),
});
export type AskResponse = z.infer<typeof askResponseSchema>;

export interface AskResult extends AskResponse {
  /** The resumes whose chunks were placed in the context — the grounding set. */
  retrievedResumeIds: string[];
}

export interface AskDeps {
  embedder: Embedder;
  store: ChunkStore;
  generator: AnswerGenerator;
  /** How many chunks to put in the context (the plan's ~8–12). */
  contextChunks?: number;
}

const SYSTEM_PROMPT = [
  'You are a recruiting assistant answering questions about a set of candidate resumes.',
  'You are given a QUESTION and a CONTEXT built from resume chunks, each tagged [resumeId | chunkType].',
  'Rules:',
  '- Answer ONLY from the provided context. Do not use outside knowledge or invent details.',
  '- Cite the resumeId for every candidate you mention.',
  '- If the context does not contain enough information to answer, say so plainly and return an empty candidates array. Do not guess.',
  '- Only reference resumeIds that appear in the context.',
  'Respond with ONLY a JSON object, no prose or markdown fences, of exactly this shape:',
  '{"answer": string, "candidates": [{"resumeId": string, "reason": string}]}',
].join('\n');

const NO_CONTEXT_ANSWER =
  'No candidates in the corpus match this query closely enough to answer.';

/** Pull the first balanced-looking JSON object out of a model reply. */
function extractJson(raw: string): unknown {
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) {
    throw new Error('generator did not return a JSON object');
  }
  return JSON.parse(raw.slice(start, end + 1));
}

export async function askAboutResumes(query: string, deps: AskDeps): Promise<AskResult> {
  const contextChunks = Math.max(1, deps.contextChunks ?? 10);

  const [embedding] = await deps.embedder.embed([query]);
  const hits = embedding ? await deps.store.search(embedding, contextChunks) : [];
  const retrievedResumeIds = [...new Set(hits.map((h) => h.resumeId))];

  // No retrieval → don't even call the model; there is nothing to ground on.
  if (hits.length === 0) {
    return { answer: NO_CONTEXT_ANSWER, candidates: [], retrievedResumeIds };
  }

  const context = hits
    .map((h) => `[${h.resumeId} | ${h.chunkType}] ${h.content}`)
    .join('\n');
  const userPrompt = `QUESTION:\n${query}\n\nCONTEXT:\n${context}`;

  const raw = await deps.generator.generate(SYSTEM_PROMPT, userPrompt);
  const parsed = askResponseSchema.parse(extractJson(raw));

  // Grounding guard: discard any candidate the model cited that wasn't retrieved.
  const grounded = parsed.candidates.filter((c) => retrievedResumeIds.includes(c.resumeId));

  return { answer: parsed.answer, candidates: grounded, retrievedResumeIds };
}
