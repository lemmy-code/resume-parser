// POST /search — semantic candidate search.
//
//   body: { query: string, topK?: number, filter?: { chunkType?, minYears? } }
//   -> { results: [{ resumeId, score, chunks: [{ chunkType, content, score }] }] }
//
// Ranked best-first; each result carries the chunks that matched so the caller
// can see why a candidate surfaced.

import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { searchResumesSemantic, type SearchDeps } from '../rag/search';
import { embedderFromEnv } from '../rag/embeddings';
import { storeFromEnv } from '../rag/store';
import type { ChunkType } from '../rag/chunk';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, x-api-key',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function jsonResponse(statusCode: number, body: unknown): APIGatewayProxyResultV2 {
  return { statusCode, headers: corsHeaders, body: JSON.stringify(body) };
}

// Warm-reused across invocations.
let deps: SearchDeps | null = null;
function getDeps(): SearchDeps {
  if (!deps) deps = { embedder: embedderFromEnv(), store: storeFromEnv() };
  return deps;
}

const VALID_CHUNK_TYPES: ChunkType[] = ['summary', 'experience', 'skills', 'education'];

export const handler = async (
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2> => {
  try {
    if (event.requestContext.http.method === 'OPTIONS') {
      return jsonResponse(200, {});
    }

    const apiKey = event.headers['x-api-key'];
    if (!apiKey || apiKey !== process.env.API_KEY) {
      return jsonResponse(401, { error: 'Unauthorized' });
    }

    let body: Record<string, unknown>;
    try {
      body = event.body ? JSON.parse(event.body) : {};
    } catch {
      return jsonResponse(400, { error: 'Invalid JSON body' });
    }

    const query = typeof body.query === 'string' ? body.query.trim() : '';
    if (!query) {
      return jsonResponse(400, { error: 'query is required' });
    }

    const topK =
      typeof body.topK === 'number' && Number.isFinite(body.topK)
        ? Math.min(Math.max(1, Math.floor(body.topK)), 50)
        : undefined;

    const rawFilter = (body.filter ?? {}) as Record<string, unknown>;
    const filter: { chunkType?: ChunkType; minYears?: number } = {};
    if (
      typeof rawFilter.chunkType === 'string' &&
      VALID_CHUNK_TYPES.includes(rawFilter.chunkType as ChunkType)
    ) {
      filter.chunkType = rawFilter.chunkType as ChunkType;
    }
    if (typeof rawFilter.minYears === 'number' && Number.isFinite(rawFilter.minYears)) {
      filter.minYears = rawFilter.minYears;
    }

    const results = await searchResumesSemantic(query, { topK, filter }, getDeps());
    return jsonResponse(200, { results });
  } catch (error) {
    console.error('Search handler error:', error);
    return jsonResponse(500, { error: 'Internal server error' });
  }
};
